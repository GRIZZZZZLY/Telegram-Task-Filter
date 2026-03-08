"""Staged-commit background worker.

Runs as an asyncio task inside the FastAPI event loop.
Every second it checks for tasks that:
  - status = done
  - committed_at IS NOT NULL  (user clicked Done)
  - committed_at <= now - delay  (undo window has closed)
  - no reaction_sent event exists yet  (reaction not yet sent)

For each such task: sends the Telegram reaction, writes reaction_sent event,
and broadcasts "task_committed" to WebSocket clients.

If the user calls POST /tasks/{id}/reopen before the delay expires,
committed_at is set to NULL — the worker skips that task automatically.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


async def run_commit_worker(delay_seconds: int) -> None:
    """Entry point — runs indefinitely until cancelled."""
    logger.info("Commit worker started | undo_window=%ds", delay_seconds)
    while True:
        try:
            await _tick(delay_seconds)
        except asyncio.CancelledError:
            logger.info("Commit worker stopped")
            raise
        except Exception as exc:
            logger.error("Commit worker tick error: %s", exc, exc_info=True)
        await asyncio.sleep(1)


async def _tick(delay_seconds: int) -> None:
    """Single iteration: find pending tasks and send reactions."""
    from sqlalchemy import select

    from ..config import get_settings
    from ..database import SessionLocal
    from ..models import Event, EventType, Task, TaskStatus
    from ..services.notification_service import manager

    settings = get_settings()
    # Use timezone-naive UTC for SQLite compatibility
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=delay_seconds)

    db = SessionLocal()
    try:
        # Subquery: task_ids that already have a reaction_sent event
        already_sent = select(Event.task_id).where(
            Event.type == EventType.reaction_sent
        )

        pending = (
            db.query(Task)
            .filter(
                Task.status == TaskStatus.done,
                Task.committed_at.isnot(None),
                Task.committed_at <= cutoff,
                Task.id.notin_(already_sent),
            )
            .all()
        )

        if pending:
            logger.info("Commit worker: %d task(s) ready to commit", len(pending))

        for task in pending:
            await _commit_task(db, task, settings, manager)

    finally:
        db.close()


async def _commit_task(db, task, settings, manager) -> None:
    """Send reaction + optional reply for one task, then record the event."""
    from ..models import Event, EventType, TaskStatus
    from ..services.telegram_service import TelegramService

    # Determine what reply and reaction to send:
    #   - task.custom_reply set   → always send it, ignoring done_send_reply flag
    #   - task.custom_reply empty → honour done_send_reply + done_reply_text from settings
    custom = (task.custom_reply or "").strip()
    send_reply = bool(custom) or settings.done_send_reply
    reply_text = custom or settings.done_reply_text

    # Determine which reaction emoji to use:
    #   - If custom reply is set and custom_reply_reaction_enabled → use custom_reply_reaction
    #     (falling back to done_reaction if custom_reply_reaction is empty)
    #   - Otherwise → use done_reaction (if done_reaction_enabled)
    is_custom_reply = bool(custom)
    if is_custom_reply and settings.custom_reply_reaction_enabled:
        reaction = (settings.custom_reply_reaction.strip() or settings.done_reaction)
        send_reaction = True
    else:
        reaction = settings.done_reaction
        send_reaction = settings.done_reaction_enabled

    logger.info(
        "Committing task | id=%d chat=%s msg=%d reaction=%r send_reaction=%s "
        "send_reply=%s reply_text=%.60r custom_reply=%s",
        task.id, task.chat_id, task.source_message_id or 0,
        reaction, send_reaction, send_reply, reply_text, bool(custom),
    )

    tg = TelegramService()
    try:
        # Hard safety check: never send reaction/reply unless source message
        # still contains one of our configured mention handles.
        mention_check_message_id = task.trigger_message_id or task.source_message_id or 0
        allowed = await tg.message_mentions_handles(
            chat_id=task.chat_id or "",
            message_id=mention_check_message_id,
            mention_handles=settings.get_mention_handles(),
        )
        if not allowed:
            logger.warning(
                "BLOCKED commit (no mention) | task_id=%d chat=%s msg=%s",
                task.id,
                task.chat_id,
                task.source_message_id,
            )
            task.status = TaskStatus.inbox
            task.committed_at = None
            task.custom_reply = None
            db.add(Event(
                task_id=task.id,
                type=EventType.error,
                payload_json=json.dumps({
                    "guard": "blocked_no_mention",
                    "chat_id": task.chat_id,
                    "source_message_id": task.source_message_id,
                    "trigger_message_id": task.trigger_message_id,
                    "ts": datetime.now(timezone.utc).isoformat(),
                }),
            ))
            db.commit()
            await manager.broadcast("task_commit_failed", {"task_id": task.id})
            return

        result = await tg.send_done(
            chat_id=task.chat_id or "",
            message_id=task.source_message_id or 0,
            reaction=reaction if send_reaction else "",
            send_reply=send_reply,
            reply_text=reply_text,
        )

        db.add(Event(
            task_id=task.id,
            type=EventType.reaction_sent,
            payload_json=json.dumps({
                "chat_id": task.chat_id,
                "source_message_id": task.source_message_id,
                "reaction": settings.done_reaction,
                "reply_message_id": result.get("reply_message_id"),
                "ts": datetime.now(timezone.utc).isoformat(),
            }),
        ))
        db.commit()
        logger.info(
            "✅ Committed | task_id=%d reply_msg_id=%s",
            task.id, result.get("reply_message_id"),
        )

        # Notify UI
        await manager.broadcast("task_committed", {"task_id": task.id})

    except Exception as exc:
        logger.error("Failed to commit task %d: %s", task.id, exc, exc_info=True)
        try:
            db.add(Event(
                task_id=task.id,
                type=EventType.error,
                payload_json=json.dumps({"error": str(exc)}),
            ))
            db.commit()
        except Exception:
            db.rollback()
        await manager.broadcast("task_commit_failed", {"task_id": task.id})
