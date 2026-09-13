"""Telethon message listener.

Registers a NewMessage handler on the active TelegramClient.
For each incoming message:
  1. Filters by monitored chats / threads (from .env — reloaded per message)
  2. Extracts @mentions from message entities
  3. Calls RuleEngine.evaluate()
  4. If create_task=True → persists Task, broadcasts via WebSocket

Design note on settings reloading:
  - `monitored_chat_ids` is passed to Telethon's @client.on() at registration time
    and CANNOT be changed without re-registering (requires restart_listener()).
  - All other settings (filter_*, mention_handles, monitored_thread_ids, rule_engine)
    are reloaded on every incoming message via get_settings() — which is instant
    because of @lru_cache, and the cache is cleared by save_settings() when changed.

Call start_listener() AFTER TelegramService.start() in lifespan.
Call restart_listener() after changing tg_monitored_chat_ids.
"""
import logging
import re
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from ..config import get_settings
from ..database import SessionLocal
from ..models import Task, TaskStatus
from ..services.notification_service import manager
from ..services.rule_engine import MessageMeta, RuleEngine
from ..services.telegram_service import TelegramService


def _detect_media_type(msg) -> str | None:
    """Return a simple media type string for a Telethon Message, or None.

    Checks msg.media against known Telethon media types without importing
    them at module level (they are only available when telethon is installed).
    """
    media = getattr(msg, "media", None)
    if media is None:
        return None
    cls = type(media).__name__
    if cls == "MessageMediaPhoto":
        return "photo"
    if cls == "MessageMediaDocument":
        # Inspect document attributes to distinguish video / audio / voice
        doc = getattr(media, "document", None)
        if doc is not None:
            attrs = getattr(doc, "attributes", []) or []
            attr_names = {type(a).__name__ for a in attrs}
            if "DocumentAttributeVideo" in attr_names:
                return "video"
            if "DocumentAttributeAudio" in attr_names:
                # Voice messages have voice=True on DocumentAttributeAudio
                for a in attrs:
                    if type(a).__name__ == "DocumentAttributeAudio":
                        if getattr(a, "voice", False):
                            return "voice"
                return "audio"
        return "document"
    if cls == "MessageMediaGeo":
        return "location"
    return None

logger = logging.getLogger(__name__)

# Track currently registered handlers so we can remove them on restart
_current_handlers: list = []


def _parse_thread_filter(csv: str) -> dict[str, set[int]]:
    """Parse 'chatId:threadId' pairs into a per-chat thread filter.

    Returns dict: chat_id (str) → set of allowed thread IDs (int).
    Old flat-format entries (no colon or colon at position 0) are gracefully ignored.
    If the CSV is empty or contains no valid pairs, returns an empty dict,
    which means "no per-chat filter — listen to all threads".
    """
    result: dict[str, set[int]] = {}
    for token in csv.split(","):
        token = token.strip()
        if not token:
            continue
        colon_idx = token.rfind(":")
        if colon_idx <= 0:
            continue  # old flat format or malformed — skip
        chat_id = token[:colon_idx]
        thread_id_str = token[colon_idx + 1:]
        if not chat_id or not thread_id_str:
            continue
        try:
            thread_id = int(thread_id_str)
        except ValueError:
            continue
        if chat_id not in result:
            result[chat_id] = set()
        result[chat_id].add(thread_id)
    return result


def _extract_thread_id(msg) -> int | None:
    if msg.reply_to:
        return getattr(msg.reply_to, "reply_to_top_id", None) or \
            getattr(msg.reply_to, "reply_to_msg_id", None)
    return None


_MENTION_RE = re.compile(r"@[A-Za-z0-9_]{3,}", re.IGNORECASE)
_URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_DISPATCH_HINT_RE = re.compile(
    r"(есть\s+кто|кто\s+свобод|кто\s+может|кто\s+возьм|кто\s+на\s+месте)",
    re.IGNORECASE,
)


def _strip_mentions_for_ping(text: str) -> str:
    no_mentions = _MENTION_RE.sub(" ", text)
    no_punct = re.sub(r"[\s,.:;!?()\[\]{}\-—]+", " ", no_mentions)
    return no_punct.strip()


def _is_short_ping_reply_text(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return True
    if _URL_RE.search(raw):
        return False

    stripped = _strip_mentions_for_ping(raw)
    if not stripped:
        return True

    words = stripped.split()
    if len(words) <= 2 and len(stripped) <= 24:
        return True

    if _DISPATCH_HINT_RE.search(stripped):
        return True

    return False


def _is_contentful_parent_text(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    if _URL_RE.search(t):
        return True
    return len(t) >= 25


def _task_payload(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "body": task.body,
        "priority": task.priority.value,
        "status": task.status.value,
        "chat_id": task.chat_id,
        "source_chat": task.chat_id,  # legacy compat
        "thread_id": task.thread_id,
        "source_message_id": task.source_message_id,
        "trigger_message_id": task.trigger_message_id,
        "sender_id": task.sender_id,
        "sender_username": task.sender_username,
        "sender_first_name": task.sender_first_name,
        "peer_reactions": task.peer_reactions,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
        "committed_at": task.committed_at.isoformat() if task.committed_at else None,
        "snoozed_until": task.snoozed_until.isoformat() if task.snoozed_until else None,
        "sort_order": task.sort_order,
        "custom_reply": task.custom_reply,
        "in_progress": task.in_progress,
        "work_started_at": task.work_started_at.isoformat() if task.work_started_at else None,
        "source_changed": task.source_changed,
        "source_edited_at": task.source_edited_at.isoformat() if task.source_edited_at else None,
    }


async def _delete_tasks_for_messages(
    channel_id: int | None,
    msg_ids: list[int],
    is_channel: bool,
) -> None:
    """Delete inbox/snoozed tasks whose source_message_id is in msg_ids.

    For channel/supergroup deletes, channel_id is used to narrow the search.
    For PM/legacy-group deletes, channel_id is None — we search across all chats
    (Telegram doesn't tell us which chat the messages belonged to in that case).

    Tasks in 'done' status are intentionally kept as historical records.
    """
    if not msg_ids:
        return

    db = SessionLocal()
    try:
        query = db.query(Task).filter(
            Task.source_message_id.in_(msg_ids),
            Task.status.in_([TaskStatus.inbox, TaskStatus.snoozed]),
        )

        if is_channel and channel_id is not None:
            # Build the chat_id string the same way as in _handle_reactions
            try:
                chat_id_str = str(-int(f"100{channel_id}"))
            except Exception:
                return
            query = query.filter(Task.chat_id == chat_id_str)

        tasks_to_delete = query.all()
        if not tasks_to_delete:
            return

        deleted_ids: list[int] = []
        for task in tasks_to_delete:
            deleted_ids.append(task.id)
            db.delete(task)

        db.commit()
        logger.info(
            "Tasks deleted (source message removed) | ids=%s msg_ids=%s",
            deleted_ids,
            msg_ids,
        )

        for task_id in deleted_ids:
            await manager.broadcast("task_deleted", {"id": task_id})

    except Exception as exc:
        logger.error("Failed to delete tasks on message delete: %s", exc)
        db.rollback()
    finally:
        db.close()


async def start_listener() -> None:
    """Register NewMessage handler on the active Telethon client.

    Does nothing if TelegramService is not connected.
    Monitored chats are read once here (Telethon filter is fixed per registration).
    All other settings are reloaded per-message.
    """
    global _current_handlers

    client = TelegramService.get_client()
    if client is None:
        logger.warning("Listener not started — Telethon client unavailable")
        return

    # Read chat IDs at registration time — Telethon needs them up front
    initial_settings = get_settings()
    monitored_chat_ids: list[int] = [
        int(cid.strip())
        for cid in initial_settings.tg_monitored_chat_ids.split(",")
        if cid.strip()
    ]

    # Resolve own user ID to catch MessageEntityMentionName (self-mentions)
    own_user_id: int | None = None
    try:
        me = await client.get_me()
        own_user_id = me.id
        logger.info(
            "Listener: own user_id=%d handles=%s",
            own_user_id, initial_settings.get_mention_handles(),
        )
    except Exception as exc:
        logger.warning("Listener: could not resolve own user_id: %s", exc)

    from telethon import events
    from telethon.tl import types
    from telethon.tl.types import MessageEntityMention, MessageEntityMentionName

    @client.on(events.NewMessage(chats=monitored_chat_ids or None))
    async def _handle_new(event: events.NewMessage.Event) -> None:
        # ── Reload settings on every message (filter changes take effect immediately)
        s = get_settings()
        mention_handles_lower = [h.lower() for h in s.get_mention_handles()]
        thread_filter = _parse_thread_filter(s.tg_monitored_thread_ids)

        msg = event.message
        text: str = msg.raw_text or ""
        chat_id = str(event.chat_id)

        logger.debug(
            "MSG received | chat=%s sender=%s outgoing=%s text=%.80r",
            chat_id, msg.sender_id, msg.out, text,
        )

        # ── Noise filter: ignore own outgoing messages ─────────────────────
        if s.filter_ignore_own and msg.out:
            logger.debug("MSG skipped — outgoing message from self")
            return

        # Thread / topic id from trigger message
        thread_id = _extract_thread_id(msg)

        # ── Extract @mentions from message entities ────────────────────────
        mentions: list[str] = []
        if msg.entities:
            for ent in msg.entities:
                if isinstance(ent, MessageEntityMention):
                    mentions.append(text[ent.offset: ent.offset + ent.length])
                elif isinstance(ent, MessageEntityMentionName):
                    if own_user_id and ent.user_id == own_user_id:
                        primary = mention_handles_lower[0] if mention_handles_lower else s.tg_mention_handle
                        mentions.append(primary)
                    else:
                        try:
                            user = await client.get_entity(ent.user_id)
                            if getattr(user, "username", None):
                                mentions.append(f"@{user.username}")
                        except Exception:
                            pass

        logger.debug(
            "MSG | chat=%s sender=%s mentions=%s text=%.80r",
            chat_id, msg.sender_id, mentions, text,
        )

        # ── Noise filter: strict mentions mode ─────────────────────────────
        if s.filter_strict_mentions:
            if not mentions:
                logger.debug("MSG skipped — no @mention found")
                return
            if mention_handles_lower:
                mentions_lower = [m.lower() for m in mentions]
                if not any(h in mentions_lower for h in mention_handles_lower):
                    logger.debug(
                        "MSG skipped — mention not in configured handles: %s", mentions
                    )
                    return

        # ── Context lift (optional): for short reply-pings, use parent text ──
        trigger_message_id = msg.id
        effective_message_id = msg.id
        effective_text = text
        effective_thread_id = thread_id

        if s.tg_context_lift_enabled and msg.reply_to and _is_short_ping_reply_text(text):
            parent_id = getattr(msg.reply_to, "reply_to_msg_id", None) or \
                        getattr(msg.reply_to, "reply_to_top_id", None)
            if parent_id is not None:
                try:
                    parent_raw = await client.get_messages(int(chat_id), ids=parent_id)
                    parent_msg = parent_raw[0] if isinstance(parent_raw, list) and parent_raw else parent_raw
                    parent_text = (getattr(parent_msg, "raw_text", None) or "") if parent_msg else ""
                    if parent_msg and _is_contentful_parent_text(parent_text):
                        effective_message_id = getattr(parent_msg, "id", effective_message_id)
                        effective_text = parent_text
                        parent_thread_id = _extract_thread_id(parent_msg)
                        if parent_thread_id is not None:
                            effective_thread_id = parent_thread_id
                        logger.info(
                            "Context lift applied | trigger_msg=%d source_msg=%d",
                            trigger_message_id,
                            effective_message_id,
                        )
                except Exception as exc:
                    logger.debug("Context lift skipped (parent fetch failed): %s", exc)

        # ── Noise filter: minimum text length (for effective text) ─────────
        if s.filter_min_text_length > 0 and len(effective_text.strip()) < s.filter_min_text_length:
            logger.debug(
                "MSG skipped — effective text too short (%d < %d)",
                len(effective_text),
                s.filter_min_text_length,
            )
            return

        # ── Thread / topic filter (for effective source) ───────────────────
        chat_thread_filter = thread_filter.get(chat_id)
        if chat_thread_filter is not None and effective_thread_id not in chat_thread_filter:
            logger.debug(
                "MSG skipped — effective thread %s not in monitored threads for chat %s",
                effective_thread_id,
                chat_id,
            )
            return

        # ── Rule evaluation (reloads YAML on each call via fresh settings) ─
        rule_engine = RuleEngine(s.rules_path)
        meta = MessageMeta(
            chat_id=chat_id,
            thread_id=str(effective_thread_id) if effective_thread_id else None,
            mentions=mentions,
            sender=str(msg.sender_id),
        )
        result = rule_engine.evaluate(effective_text, meta)

        if not result.create_task:
            logger.info("MSG skipped — no rule matched (rule=%s)", result.matched_rule_id)
            return

        # ── Persist task ───────────────────────────────────────────────────
        title = _extract_title(effective_text)

        # Extract sender info without extra API call (may be None)
        sender_uname: str | None = None
        sender_fname: str | None = None
        try:
            if msg.sender:
                if getattr(msg.sender, "username", None):
                    sender_uname = f"@{msg.sender.username}"
                first = getattr(msg.sender, "first_name", None) or ""
                last = getattr(msg.sender, "last_name", None) or ""
                full = f"{first} {last}".strip()
                if full:
                    sender_fname = full
        except Exception:
            pass

        db = SessionLocal()
        try:
            # Deduplication: skip if a task for this message already exists
            existing = db.query(Task).filter(
                Task.chat_id == chat_id,
                Task.source_message_id == effective_message_id,
            ).first()
            if existing:
                logger.debug(
                    "MSG skipped — duplicate source_message_id=%d (task_id=%d)",
                    effective_message_id,
                    existing.id,
                )
                return

            task = Task(
                title=title,
                body=effective_text if len(effective_text) > len(title) else None,
                status=TaskStatus.inbox,
                priority=result.priority,
                chat_id=chat_id,
                thread_id=str(effective_thread_id) if effective_thread_id else None,
                source_message_id=effective_message_id,
                trigger_message_id=trigger_message_id,
                sender_id=str(msg.sender_id) if msg.sender_id else None,
                sender_username=sender_uname,
                sender_first_name=sender_fname,
                media_type=_detect_media_type(msg),
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            logger.info(
                "✅ Task created | id=%d rule=%s priority=%s chat=%s text=%.60r",
                task.id, result.matched_rule_id, task.priority.value, chat_id, title,
            )
        except IntegrityError:
            # The unique index caught what the check above raced past: another
            # handler inserted this same message first. Not an error.
            db.rollback()
            logger.debug(
                "MSG skipped — duplicate source_message_id=%d (lost insert race)",
                effective_message_id,
            )
            return
        except Exception as exc:
            logger.error("Failed to persist task: %s", exc)
            db.rollback()
            return
        finally:
            db.close()

        # ── Broadcast to UI via WebSocket ──────────────────────────────────
        await manager.broadcast("task_created", _task_payload(task))

    @client.on(events.MessageEdited(chats=monitored_chat_ids or None))
    async def _handle_edited(event: events.MessageEdited.Event) -> None:
        # Edit sync is automatic for inbox/snoozed tasks.
        # For done tasks we keep historical snapshot (no auto-update).
        s = get_settings()
        mention_handles_lower = [h.lower() for h in s.get_mention_handles()]
        thread_filter = _parse_thread_filter(s.tg_monitored_thread_ids)

        msg = event.message
        text: str = msg.raw_text or ""
        chat_id = str(event.chat_id)
        thread_id = _extract_thread_id(msg)

        # Determine whether edited message still matches current filters/rules.
        still_matches = True

        if s.filter_ignore_own and msg.out:
            still_matches = False

        if still_matches and s.filter_min_text_length > 0 and len(text.strip()) < s.filter_min_text_length:
            still_matches = False

        chat_thread_filter = thread_filter.get(chat_id)
        if still_matches and chat_thread_filter is not None and thread_id not in chat_thread_filter:
            still_matches = False

        mentions: list[str] = []
        if msg.entities:
            for ent in msg.entities:
                if isinstance(ent, MessageEntityMention):
                    mentions.append(text[ent.offset: ent.offset + ent.length])
                elif isinstance(ent, MessageEntityMentionName):
                    if own_user_id and ent.user_id == own_user_id:
                        primary = mention_handles_lower[0] if mention_handles_lower else s.tg_mention_handle
                        mentions.append(primary)
                    else:
                        try:
                            user = await client.get_entity(ent.user_id)
                            if getattr(user, "username", None):
                                mentions.append(f"@{user.username}")
                        except Exception:
                            pass

        if still_matches and s.filter_strict_mentions:
            if not mentions:
                still_matches = False
            elif mention_handles_lower:
                mentions_lower = [m.lower() for m in mentions]
                if not any(h in mentions_lower for h in mention_handles_lower):
                    still_matches = False

        if still_matches:
            rule_engine = RuleEngine(s.rules_path)
            meta = MessageMeta(
                chat_id=chat_id,
                thread_id=str(thread_id) if thread_id else None,
                mentions=mentions,
                sender=str(msg.sender_id),
            )
            still_matches = rule_engine.evaluate(text, meta).create_task

        db = SessionLocal()
        try:
            task = db.query(Task).filter(
                Task.chat_id == chat_id,
                Task.source_message_id == msg.id,
            ).first()
            if task is None:
                return

            if task.status not in (TaskStatus.inbox, TaskStatus.snoozed):
                return

            title = _extract_title(text)
            body = text if len(text) > len(title) else None

            edit_ts = getattr(msg, "edit_date", None)
            if edit_ts is None:
                edit_ts = datetime.now(timezone.utc)
            if edit_ts.tzinfo is not None:
                edit_ts = edit_ts.astimezone(timezone.utc).replace(tzinfo=None)

            task.title = title
            task.body = body
            task.thread_id = str(thread_id) if thread_id else None
            task.source_changed = not still_matches
            task.source_edited_at = edit_ts
            task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

            db.commit()
            db.refresh(task)

            logger.info(
                "Task source updated from Telegram edit | id=%d source_changed=%s",
                task.id,
                task.source_changed,
            )
        except Exception as exc:
            logger.error("Failed to sync edited message: %s", exc)
            db.rollback()
            return
        finally:
            db.close()

        await manager.broadcast("task_updated", _task_payload(task))

    @client.on(events.Raw(types.UpdateMessageReactions))
    async def _handle_reactions(update) -> None:
        """Sync all reactions on a message to the matching task's peer_reactions field.

        Strategy:
        1. Extract chat_id / msg_id from the raw update.
        2. Use update.reactions.recent_reactions as the authoritative source —
           it is always present (empty list = all reactions removed) and requires
           no extra API call.
        3. Enrich with real names via get_entity() — best-effort, failures are
           silently ignored so the update always goes through.
        4. Always persist + broadcast, even when the list is empty (covers the
           "reaction removed" case that previously left stale data in the UI).
        """
        import json
        from datetime import datetime, timezone

        try:
            peer = getattr(update, "peer", None)
            msg_id: int | None = getattr(update, "msg_id", None)
            if peer is None or msg_id is None:
                return

            # ── Resolve chat_id to the same format used when tasks are stored ──
            try:
                chat_id_raw = (
                    getattr(peer, "channel_id", None)
                    or getattr(peer, "chat_id", None)
                    or getattr(peer, "user_id", None)
                )
                if chat_id_raw is None:
                    return
                if hasattr(peer, "channel_id"):
                    chat_id_str = str(-int(f"100{chat_id_raw}"))
                elif hasattr(peer, "chat_id"):
                    chat_id_str = str(-chat_id_raw)
                else:
                    chat_id_str = str(chat_id_raw)
            except Exception:
                return

            # ── Find matching task ────────────────────────────────────────────
            db = SessionLocal()
            try:
                task = db.query(Task).filter(
                    Task.chat_id == chat_id_str,
                    Task.source_message_id == msg_id,
                ).first()
                if task is None:
                    return

                # ── Build reactions list from update.reactions.recent_reactions ─
                # This field is always present and reflects the current state,
                # including an empty list when all reactions have been removed.
                msg_reactions = getattr(update, "reactions", None)
                recent = getattr(msg_reactions, "recent_reactions", None) or []

                reactions_list: list[dict] = []
                now_ts = datetime.now(timezone.utc).isoformat()

                for rp in recent:
                    emoji = getattr(getattr(rp, "reaction", None), "emoticon", None) or "?"
                    peer_id = getattr(rp, "peer_id", None)
                    user_id_val = getattr(peer_id, "user_id", None)

                    first_name: str | None = None
                    username: str | None = None

                    # Best-effort name resolution — never blocks the update
                    if user_id_val:
                        try:
                            user_entity = await client.get_entity(user_id_val)
                            first = getattr(user_entity, "first_name", None) or ""
                            last = getattr(user_entity, "last_name", None) or ""
                            full = f"{first} {last}".strip()
                            first_name = full or None
                            uname = getattr(user_entity, "username", None)
                            username = f"@{uname}" if uname else None
                        except Exception:
                            pass

                    reactions_list.append({
                        "user_id": str(user_id_val) if user_id_val else None,
                        "username": username,
                        "first_name": first_name,
                        "emoji": emoji,
                        "ts": now_ts,
                    })

                # ── Persist (always, even empty list = reactions cleared) ──────
                task.peer_reactions = json.dumps(reactions_list, ensure_ascii=False)
                db.add(task)
                db.commit()
                db.refresh(task)
                logger.debug(
                    "Peer reactions updated | task_id=%d count=%d",
                    task.id, len(reactions_list),
                )
            except Exception as exc:
                logger.error("Failed to sync peer reactions: %s", exc)
                db.rollback()
                return
            finally:
                db.close()

            await manager.broadcast("task_updated", _task_payload(task))

        except Exception as exc:
            logger.error("_handle_reactions error: %s", exc)

    @client.on(events.Raw(types.UpdateDeleteChannelMessages))
    async def _handle_deleted_channel(update) -> None:
        """Delete tasks whose source message was deleted in a channel/supergroup."""
        await _delete_tasks_for_messages(
            channel_id=getattr(update, "channel_id", None),
            msg_ids=list(getattr(update, "messages", []) or []),
            is_channel=True,
        )

    @client.on(events.Raw(types.UpdateDeleteMessages))
    async def _handle_deleted_pm(update) -> None:
        """Delete tasks whose source message was deleted in a PM or legacy group."""
        await _delete_tasks_for_messages(
            channel_id=None,
            msg_ids=list(getattr(update, "messages", []) or []),
            is_channel=False,
        )

    _current_handlers = [
        _handle_new,
        _handle_edited,
        _handle_reactions,
        _handle_deleted_channel,
        _handle_deleted_pm,
    ]

    logger.info(
        "Telethon listener registered | chats=%s handle=%s",
        monitored_chat_ids or "all",
        initial_settings.tg_mention_handle,
    )


async def restart_listener() -> None:
    """Remove the existing handler and re-register with fresh settings.

    Call this after changing tg_monitored_chat_ids or tg_monitored_thread_ids.
    Other settings (filter_*, mention_handles) are already reloaded per-message
    and don't require a restart.
    """
    global _current_handlers

    client = TelegramService.get_client()
    if client is None:
        logger.warning("Cannot restart listener — Telethon client unavailable")
        return

    # Remove old handlers
    for handler in _current_handlers:
        client.remove_event_handler(handler)
    if _current_handlers:
        logger.info("Listener: old handlers removed | count=%d", len(_current_handlers))
    _current_handlers = []

    # Re-register with updated chat IDs
    await start_listener()
    logger.info("Listener restarted with fresh settings")


def _extract_title(text: str, max_len: int = 120) -> str:
    """Return the first non-empty line of text, truncated to max_len."""
    first_line = next(
        (ln.strip() for ln in text.splitlines() if ln.strip()),
        text.strip(),
    )
    if len(first_line) <= max_len:
        return first_line or text[:max_len]
    return first_line[:max_len] + "…"
