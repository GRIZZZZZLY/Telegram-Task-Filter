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

from ..config import get_settings
from ..database import SessionLocal
from ..models import Task, TaskStatus
from ..services.notification_service import manager
from ..services.rule_engine import MessageMeta, RuleEngine
from ..services.telegram_service import TelegramService

logger = logging.getLogger(__name__)

# Track the currently registered handler so we can remove it on restart
_current_handler = None


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


async def start_listener() -> None:
    """Register NewMessage handler on the active Telethon client.

    Does nothing if TelegramService is not connected.
    Monitored chats are read once here (Telethon filter is fixed per registration).
    All other settings are reloaded per-message.
    """
    global _current_handler

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
    from telethon.tl.types import MessageEntityMention, MessageEntityMentionName

    @client.on(events.NewMessage(chats=monitored_chat_ids or None))
    async def _handle(event: events.NewMessage.Event) -> None:
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

        # ── Noise filter: minimum text length ─────────────────────────────
        if s.filter_min_text_length > 0 and len(text.strip()) < s.filter_min_text_length:
            logger.debug("MSG skipped — text too short (%d < %d)", len(text), s.filter_min_text_length)
            return

        # ── Thread / topic filter ──────────────────────────────────────────
        thread_id: int | None = None
        if msg.reply_to:
            thread_id = getattr(msg.reply_to, "reply_to_top_id", None) or \
                        getattr(msg.reply_to, "reply_to_msg_id", None)

        chat_thread_filter = thread_filter.get(chat_id)
        if chat_thread_filter is not None and thread_id not in chat_thread_filter:
            logger.debug(
                "MSG skipped — thread %s not in monitored threads for chat %s",
                thread_id, chat_id,
            )
            return

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

        # ── Rule evaluation (reloads YAML on each call via fresh settings) ─
        rule_engine = RuleEngine(s.rules_path)
        meta = MessageMeta(
            chat_id=chat_id,
            thread_id=str(thread_id) if thread_id else None,
            mentions=mentions,
            sender=str(msg.sender_id),
        )
        result = rule_engine.evaluate(text, meta)

        if not result.create_task:
            logger.info("MSG skipped — no rule matched (rule=%s)", result.matched_rule_id)
            return

        # ── Persist task ───────────────────────────────────────────────────
        title = _extract_title(text)

        # Extract sender username without extra API call (may be None)
        sender_uname: str | None = None
        try:
            if msg.sender and getattr(msg.sender, "username", None):
                sender_uname = f"@{msg.sender.username}"
        except Exception:
            pass

        db = SessionLocal()
        try:
            # Deduplication: skip if a task for this message already exists
            existing = db.query(Task).filter(Task.source_message_id == msg.id).first()
            if existing:
                logger.debug("MSG skipped — duplicate message_id=%d (task_id=%d)", msg.id, existing.id)
                return

            task = Task(
                title=title,
                body=text if len(text) > len(title) else None,
                status=TaskStatus.inbox,
                priority=result.priority,
                chat_id=chat_id,
                thread_id=str(thread_id) if thread_id else None,
                source_message_id=msg.id,
                sender_id=str(msg.sender_id) if msg.sender_id else None,
                sender_username=sender_uname,
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            logger.info(
                "✅ Task created | id=%d rule=%s priority=%s chat=%s text=%.60r",
                task.id, result.matched_rule_id, task.priority.value, chat_id, title,
            )
        except Exception as exc:
            logger.error("Failed to persist task: %s", exc)
            db.rollback()
            return
        finally:
            db.close()

        # ── Broadcast to UI via WebSocket ──────────────────────────────────
        await manager.broadcast("task_created", {
            "id": task.id,
            "title": task.title,
            "priority": task.priority.value,
            "status": task.status.value,
            "chat_id": chat_id,
            "source_chat": chat_id,          # legacy compat
            "thread_id": task.thread_id,
            "source_message_id": task.source_message_id,
            "sender_id": task.sender_id,
            "sender_username": task.sender_username,
            "created_at": task.created_at.isoformat(),
            "committed_at": None,
            "snoozed_until": None,
            "sort_order": task.sort_order,
        })

    _current_handler = _handle

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
    global _current_handler

    client = TelegramService.get_client()
    if client is None:
        logger.warning("Cannot restart listener — Telethon client unavailable")
        return

    # Remove the old handler
    if _current_handler is not None:
        client.remove_event_handler(_current_handler)
        _current_handler = None
        logger.info("Listener: old handler removed")

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
