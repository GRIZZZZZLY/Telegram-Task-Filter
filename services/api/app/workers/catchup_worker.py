"""Catch-up worker — scans message history on startup.

Runs once after TelegramService.start() to pick up messages received while
the app was offline. Uses the same RuleEngine + deduplication logic as the
live listener, so no duplicate tasks are created.

Key behaviour:
  - Scans from midnight of the current day (or N hours back, whichever is later).
  - If a message already has our reaction emoji → task is created as status=done
    (it was already handled manually in Telegram — no need to show in inbox).
  - Runs in a background asyncio task so it never blocks startup.
  - Respects catchup_hours=0 to disable entirely.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


async def run_catchup(scan_hours: int | None = None) -> dict:
    """Scan recent message history and create tasks for matched messages.

    Args:
        scan_hours: override catchup_hours from settings (used by manual scan endpoint).

    Returns:
        {"scanned": int, "created": int, "skipped_done": int, "skipped_dup": int}
    """
    from ..config import get_settings
    from ..services.telegram_service import TelegramService
    from ..services.rule_engine import RuleEngine, MessageMeta
    from ..database import SessionLocal
    from ..models import Task, TaskPriority, TaskStatus
    from ..services.notification_service import manager

    from telethon.tl.types import MessageEntityMention, MessageEntityMentionName

    s = get_settings()
    hours = scan_hours if scan_hours is not None else s.catchup_hours

    if hours == 0:
        logger.info("Catch-up scan disabled (catchup_hours=0)")
        return {"scanned": 0, "created": 0, "updated": 0, "skipped_done": 0, "skipped_dup": 0}

    client = TelegramService.get_client()
    if client is None:
        logger.warning("Catch-up scan skipped — Telegram client unavailable")
        return {"scanned": 0, "created": 0, "updated": 0, "skipped_done": 0, "skipped_dup": 0}

    # ── Determine scan window ─────────────────────────────────────────────────
    from ..tz import MSK

    now_utc = datetime.now(timezone.utc)

    # Start from midnight of today in Moscow time (UTC+3), converted to UTC.
    # Using MSK midnight instead of local time ensures correct behaviour
    # regardless of the server/container timezone.
    midnight_msk = datetime.now(MSK).replace(hour=0, minute=0, second=0, microsecond=0)
    midnight_utc = midnight_msk.astimezone(timezone.utc)
    hours_back_utc = now_utc - timedelta(hours=hours)
    # Use whichever is more recent (smaller window)
    scan_from = max(midnight_utc, hours_back_utc)

    logger.info(
        "Catch-up scan started | from=%s hours=%d",
        scan_from.astimezone(MSK).strftime("%Y-%m-%d %H:%M MSK"), hours,
    )

    # ── Resolve own user + handles ────────────────────────────────────────────
    own_user_id: int | None = None
    try:
        me = await client.get_me()
        own_user_id = me.id
    except Exception as exc:
        logger.warning("Catch-up: could not resolve own user_id: %s", exc)

    mention_handles_lower = [h.lower() for h in s.get_mention_handles()]
    monitored_chat_ids: list[int] = [
        int(cid.strip())
        for cid in s.tg_monitored_chat_ids.split(",")
        if cid.strip()
    ]
    from .tg_listener import _extract_title, _parse_thread_filter, _task_payload
    thread_filter = _parse_thread_filter(s.tg_monitored_thread_ids)
    done_reaction_emoji = s.done_reaction

    rule_engine = RuleEngine(s.rules_path)

    stats = {"scanned": 0, "created": 0, "updated": 0, "skipped_done": 0, "skipped_dup": 0}

    # ── Iterate chats ─────────────────────────────────────────────────────────
    chats_to_scan = monitored_chat_ids if monitored_chat_ids else []

    if not chats_to_scan:
        # No specific chats configured — scan recent dialogs
        try:
            async for dialog in client.iter_dialogs(limit=30):
                chats_to_scan.append(dialog.id)
        except Exception as exc:
            logger.error("Catch-up: failed to list dialogs: %s", exc)
            return stats

    for chat_id_int in chats_to_scan:
        chat_id_str = str(chat_id_int)
        try:
            async for msg in client.iter_messages(chat_id_int, offset_date=now_utc, reverse=False, limit=200):
                # Stop when we go past our scan window
                if msg.date is None:
                    continue
                msg_date = msg.date if msg.date.tzinfo else msg.date.replace(tzinfo=timezone.utc)
                if msg_date < scan_from:
                    break

                stats["scanned"] += 1

                # ── Evaluate current matching state for this message ───────────
                text: str = msg.raw_text or ""
                thread_id: int | None = None
                if msg.reply_to:
                    thread_id = getattr(msg.reply_to, "reply_to_top_id", None) or \
                                getattr(msg.reply_to, "reply_to_msg_id", None)

                mentions: list[str] = []
                if msg.entities:
                    for ent in msg.entities:
                        if isinstance(ent, MessageEntityMention):
                            mentions.append(text[ent.offset: ent.offset + ent.length])
                        elif isinstance(ent, MessageEntityMentionName):
                            if own_user_id and ent.user_id == own_user_id:
                                primary = mention_handles_lower[0] if mention_handles_lower else s.tg_mention_handle
                                mentions.append(primary)

                still_matches = True
                eval_result = None
                if s.filter_ignore_own and msg.out:
                    still_matches = False
                if still_matches and s.filter_min_text_length > 0 and len(text.strip()) < s.filter_min_text_length:
                    still_matches = False
                chat_thread_filter = thread_filter.get(chat_id_str)
                if still_matches and chat_thread_filter is not None and thread_id not in chat_thread_filter:
                    still_matches = False
                if still_matches and s.filter_strict_mentions:
                    if not mentions:
                        still_matches = False
                    elif mention_handles_lower:
                        mentions_lower = [m.lower() for m in mentions]
                        if not any(h in mentions_lower for h in mention_handles_lower):
                            still_matches = False
                if still_matches:
                    meta = MessageMeta(
                        chat_id=chat_id_str,
                        thread_id=str(thread_id) if thread_id else None,
                        mentions=mentions,
                        sender=str(msg.sender_id),
                    )
                    eval_result = rule_engine.evaluate(text, meta)
                    still_matches = eval_result.create_task

                # ── Persist/create/reconcile task ──────────────────────────────
                db = SessionLocal()
                try:
                    existing = db.query(Task).filter(
                        Task.chat_id == chat_id_str,
                        Task.source_message_id == msg.id,
                    ).first()

                    # Existing task: reconcile edited source for inbox/snoozed only.
                    if existing is not None:
                        stats["skipped_dup"] += 1

                        if existing.status in (TaskStatus.inbox, TaskStatus.snoozed):
                            title = _extract_title(text)
                            body = text if len(text) > len(title) else None

                            edit_ts = getattr(msg, "edit_date", None)
                            if edit_ts is not None and edit_ts.tzinfo is not None:
                                edit_ts = edit_ts.astimezone(timezone.utc).replace(tzinfo=None)

                            changed = False
                            if existing.title != title:
                                existing.title = title
                                changed = True
                            if existing.body != body:
                                existing.body = body
                                changed = True
                            new_thread = str(thread_id) if thread_id else None
                            if existing.thread_id != new_thread:
                                existing.thread_id = new_thread
                                changed = True
                            if existing.source_changed != (not still_matches):
                                existing.source_changed = not still_matches
                                changed = True
                            if edit_ts is not None and existing.source_edited_at != edit_ts:
                                existing.source_edited_at = edit_ts
                                changed = True

                            if changed:
                                existing.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                                db.commit()
                                db.refresh(existing)
                                stats["updated"] += 1
                                await manager.broadcast("task_updated", _task_payload(existing))

                        # done tasks are intentionally not updated automatically
                        continue

                    # New task creation only for currently matching messages.
                    if not still_matches:
                        continue

                    # ── Check if message already has our reaction ─────────────
                    already_reacted = False
                    try:
                        if msg.reactions:
                            for reaction_count in msg.reactions.results:
                                emoji = getattr(getattr(reaction_count, "reaction", None), "emoticon", None)
                                if emoji == done_reaction_emoji:
                                    already_reacted = True
                                    break
                    except Exception:
                        pass

                    title = _extract_title(text)

                    # Extract sender info without extra API call
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

                    # If already reacted → create as done (was handled in Telegram)
                    status = TaskStatus.done if already_reacted else TaskStatus.inbox
                    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

                    create_priority = eval_result.priority if eval_result is not None else TaskPriority.medium

                    source_edited_at = getattr(msg, "edit_date", None)
                    if source_edited_at is not None and source_edited_at.tzinfo is not None:
                        source_edited_at = source_edited_at.astimezone(timezone.utc).replace(tzinfo=None)

                    task = Task(
                        title=title,
                        body=text if len(text) > len(title) else None,
                        status=status,
                        priority=create_priority,
                        chat_id=chat_id_str,
                        thread_id=str(thread_id) if thread_id else None,
                        source_message_id=msg.id,
                        trigger_message_id=msg.id,
                        committed_at=now_naive if already_reacted else None,
                        sender_id=str(msg.sender_id) if msg.sender_id else None,
                        sender_username=sender_uname,
                        sender_first_name=sender_fname,
                        source_changed=False,
                        source_edited_at=source_edited_at,
                    )
                    db.add(task)
                    db.commit()
                    db.refresh(task)

                    stats["created"] += 1
                    if already_reacted:
                        stats["skipped_done"] += 1
                        logger.debug(
                            "Catch-up: task created as done (already reacted) | msg_id=%d", msg.id
                        )
                    else:
                        logger.info(
                            "Catch-up: task created | id=%d priority=%s chat=%s text=%.60r",
                            task.id, task.priority.value, chat_id_str, title,
                        )
                        await manager.broadcast("task_created", _task_payload(task))

                except Exception as exc:
                    logger.error("Catch-up: failed to persist task for msg_id=%d: %s", msg.id, exc)
                    db.rollback()
                finally:
                    db.close()

                # Small yield to avoid blocking the event loop
                await asyncio.sleep(0)

        except Exception as exc:
            logger.error("Catch-up: error scanning chat %s: %s", chat_id_int, exc)
            continue

    logger.info(
        "Catch-up scan complete | scanned=%d created=%d updated=%d skipped_done=%d skipped_dup=%d",
        stats["scanned"], stats["created"], stats["updated"], stats["skipped_done"], stats["skipped_dup"],
    )
    return stats
