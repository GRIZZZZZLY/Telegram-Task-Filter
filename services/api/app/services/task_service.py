"""Task CRUD operations and business logic."""
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Event, EventType, Task, TaskPriority, TaskStatus
from .telegram_service import TelegramService


def _now() -> datetime:
    """UTC-naive timestamp — SQLite stores datetimes without tz, keep consistent."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TaskService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Queries ────────────────────────────────────────────────────────────

    def get_tasks(
        self,
        status: Optional[TaskStatus] = None,
        priority: Optional[TaskPriority] = None,
        thread_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Task], int]:
        """Return (items, total) with optional filters.

        Results ordered by created_at DESC (newest first).
        """
        q = self.db.query(Task)
        if status is not None:
            q = q.filter(Task.status == status)
        if priority is not None:
            q = q.filter(Task.priority == priority)
        if thread_id is not None:
            q = q.filter(Task.thread_id == thread_id)

        total = q.count()
        items = q.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
        return items, total

    # ── Done flow ──────────────────────────────────────────────────────────

    def mark_done(self, task_id: int) -> Task:
        """Set status=done, write 'done' event. Returns updated task.

        Staged-commit: committed_at is set here as a placeholder.
        The actual Telegram reaction is sent by a background worker
        after the done_commit_delay_seconds window (stage 2).

        Raises:
            HTTPException 404: task not found.
            HTTPException 409: task already done.
        """
        task = self._get_or_404(task_id)
        if task.status == TaskStatus.done:
            raise HTTPException(status_code=409, detail=f"Task {task_id} is already done")

        now = _now()
        task.status = TaskStatus.done
        task.updated_at = now
        task.committed_at = now  # marks "reaction pending / sent"

        self.db.add(Event(
            task_id=task.id,
            type=EventType.done,
            payload_json=json.dumps({"task_id": task_id, "ts": now.isoformat()}),
            ts=now,
        ))
        self.db.commit()
        self.db.refresh(task)

        # TODO (stage 2): schedule TelegramService.send_done() via background task
        # after done_commit_delay_seconds to allow undo within the window.

        return task

    # ── Reopen flow ────────────────────────────────────────────────────────

    async def reopen(self, task_id: int) -> dict:
        """Return task to inbox. Remove reaction and reply message in Telegram.

        Raises:
            HTTPException 404: task not found.
            HTTPException 409: task is already in inbox.
        """
        task = self._get_or_404(task_id)
        if task.status == TaskStatus.inbox:
            raise HTTPException(status_code=409, detail=f"Task {task_id} is already in inbox")

        # Find the latest reaction_sent event for TG metadata
        reaction_event = (
            self.db.query(Event)
            .filter(Event.task_id == task_id, Event.type == EventType.reaction_sent)
            .order_by(Event.ts.desc())
            .first()
        )

        reaction_removed = False
        reply_deleted = False
        warnings: List[str] = []

        if reaction_event and task.chat_id and task.source_message_id:
            payload = json.loads(reaction_event.payload_json or "{}")
            reply_message_id = payload.get("reply_message_id")

            tg = TelegramService()
            result = await tg.remove_done(
                chat_id=task.chat_id,
                message_id=task.source_message_id,
                reply_message_id=reply_message_id,
            )
            reaction_removed = result["reaction_removed"]
            reply_deleted = result["reply_deleted"]

            if reply_message_id and not reply_deleted:
                warnings.append(
                    "Message could not be deleted (older than 48h or insufficient permissions). "
                    "Delete manually in Telegram."
                )

        now = _now()
        task.status = TaskStatus.inbox
        task.committed_at = None
        task.updated_at = now

        self.db.add(Event(
            task_id=task.id,
            type=EventType.reopened,
            payload_json=json.dumps({
                "reaction_removed": reaction_removed,
                "reply_deleted": reply_deleted,
                "warnings": warnings,
                "ts": now.isoformat(),
            }),
            ts=now,
        ))
        self.db.commit()
        self.db.refresh(task)

        return {
            "task": task,
            "reaction_removed": reaction_removed,
            "reply_deleted": reply_deleted,
            "warnings": warnings,
        }

    # ── Snooze flow ────────────────────────────────────────────────────────

    def snooze(self, task_id: int, minutes: int) -> Task:
        """Snooze a task for `minutes` minutes.

        Sets status=snoozed and snoozed_until=now+minutes.
        The snooze worker will move it back to inbox when time is up.

        Raises:
            HTTPException 404: task not found.
            HTTPException 409: task is already done (can't snooze done tasks).
        """
        task = self._get_or_404(task_id)
        if task.status == TaskStatus.done:
            raise HTTPException(status_code=409, detail=f"Task {task_id} is done and cannot be snoozed")

        now = _now()
        wake_at = now + timedelta(minutes=minutes)

        task.status = TaskStatus.snoozed
        task.snoozed_until = wake_at
        task.updated_at = now

        self.db.add(Event(
            task_id=task.id,
            type=EventType.snoozed,
            payload_json=json.dumps({"minutes": minutes, "wake_at": wake_at.isoformat()}),
            ts=now,
        ))
        self.db.commit()
        self.db.refresh(task)
        return task

    # ── Priority change ────────────────────────────────────────────────────

    def change_priority(self, task_id: int, priority: TaskPriority) -> Task:
        """Change the priority of a task (any status).

        Raises:
            HTTPException 404: task not found.
        """
        task = self._get_or_404(task_id)
        task.priority = priority
        task.updated_at = _now()
        self.db.commit()
        self.db.refresh(task)
        return task

    # ── Clear done tasks ───────────────────────────────────────────────────

    def clear_done(self, older_than_days: int = 0) -> int:
        """Delete done tasks.

        If older_than_days > 0, only deletes tasks committed more than N days ago.
        Returns the number of deleted tasks.
        """
        q = self.db.query(Task).filter(Task.status == TaskStatus.done)
        if older_than_days > 0:
            cutoff = _now() - timedelta(days=older_than_days)
            q = q.filter(Task.committed_at <= cutoff)  # type: ignore[arg-type]
        count = q.count()
        q.delete(synchronize_session=False)
        self.db.commit()
        return count

    # ── Helpers ────────────────────────────────────────────────────────────

    def _get_or_404(self, task_id: int) -> Task:
        task: Optional[Task] = self.db.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return task
