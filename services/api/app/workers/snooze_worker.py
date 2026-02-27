"""Snooze wake-up worker.

Runs as an asyncio task. Every 30 seconds checks for snoozed tasks
whose snoozed_until has passed, moves them back to inbox, and
broadcasts a 'task_woken' WebSocket event so the UI updates.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def run_snooze_worker(interval_seconds: int = 30) -> None:
    """Entry point — runs indefinitely until cancelled."""
    logger.info("Snooze worker started | interval=%ds", interval_seconds)
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            logger.info("Snooze worker stopped")
            raise
        except Exception as exc:
            logger.error("Snooze worker tick error: %s", exc, exc_info=True)
        await asyncio.sleep(interval_seconds)


async def _tick() -> None:
    """Wake up any tasks whose snooze time has passed."""
    from ..database import SessionLocal
    from ..models import Event, EventType, Task, TaskStatus
    from ..services.notification_service import manager

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    db = SessionLocal()
    try:
        due = (
            db.query(Task)
            .filter(
                Task.status == TaskStatus.snoozed,
                Task.snoozed_until.isnot(None),
                Task.snoozed_until <= now,
            )
            .all()
        )

        if due:
            logger.info("Snooze worker: waking %d task(s)", len(due))

        for task in due:
            task.status = TaskStatus.inbox
            task.snoozed_until = None
            task.updated_at = now

            db.add(Event(
                task_id=task.id,
                type=EventType.woken,
                payload_json=json.dumps({"ts": now.isoformat()}),
                ts=now,
            ))
            db.commit()
            db.refresh(task)

            logger.info("Task woken | id=%d title=%.50r", task.id, task.title)

            await manager.broadcast("task_woken", {
                "id": task.id,
                "title": task.title,
                "priority": task.priority.value,
                "status": task.status.value,
                "source_chat": task.chat_id or "",
                "source_message_id": task.source_message_id,
                "created_at": task.created_at.isoformat(),
                "committed_at": None,
                "snoozed_until": None,
            })

    finally:
        db.close()
