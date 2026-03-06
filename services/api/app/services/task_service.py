"""Task CRUD operations and business logic."""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import case as sa_case, func
from sqlalchemy.orm import Session

from ..models import Event, EventType, Task, TaskPriority, TaskStatus
from .telegram_service import TelegramService

logger = logging.getLogger(__name__)


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
        # Inbox: configurable sort (pin/DnD → optional priority → date direction)
        # Done/Snoozed: always newest first
        if status == TaskStatus.inbox:
            from ..config import get_settings
            s = get_settings()

            # Build priority expression: high=0, medium=1, low=2, normal=3
            priority_expr = sa_case(
                {"high": 0, "medium": 1, "low": 2},
                value=Task.priority,
                else_=3,
            )

            order_clauses = [Task.sort_order.asc().nulls_last()]
            if s.tasks_inbox_sort_by_priority:
                order_clauses.append(priority_expr)
            if s.tasks_inbox_sort_direction == "asc":
                order_clauses.append(Task.created_at.asc())
            else:
                order_clauses.append(Task.created_at.desc())

            items = q.order_by(*order_clauses).offset(offset).limit(limit).all()
        else:
            items = q.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
        return items, total

    # ── Done flow ──────────────────────────────────────────────────────────

    def mark_done(self, task_id: int, custom_reply: Optional[str] = None) -> Task:
        """Set status=done, write 'done' event. Returns updated task.

        Staged-commit: committed_at is set here as a placeholder.
        The actual Telegram reaction is sent by a background worker
        after the done_commit_delay_seconds window (stage 2).

        Args:
            custom_reply: if provided, overrides the default reply text from settings.

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
        task.in_progress = False
        task.work_started_at = None
        if custom_reply is not None:
            task.custom_reply = custom_reply.strip() or None

        self.db.add(Event(
            task_id=task.id,
            type=EventType.done,
            payload_json=json.dumps({
                "task_id": task_id,
                "custom_reply": custom_reply,
                "ts": now.isoformat(),
            }),
            ts=now,
        ))
        self.db.commit()
        self.db.refresh(task)
        logger.info("Task marked done | id=%d title=%.60r", task.id, task.title)
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
        task.custom_reply = None
        task.in_progress = False
        task.work_started_at = None
        task.updated_at = now

        # Delete all reaction_sent events for this task so that
        # commit_worker can re-send the reaction on the next mark_done.
        deleted_rs = (
            self.db.query(Event)
            .filter(Event.task_id == task_id, Event.type == EventType.reaction_sent)
            .delete(synchronize_session=False)
        )
        if deleted_rs:
            logger.debug("Deleted %d reaction_sent event(s) for task %d", deleted_rs, task_id)

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
        logger.info("Task reopened | id=%d title=%.60r", task.id, task.title)

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
        task.in_progress = False
        task.work_started_at = None
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

    # ── Reorder ────────────────────────────────────────────────────────────

    def reorder(self, ids: List[int]) -> None:
        """Persist manual sort order for inbox tasks.

        Assigns sort_order = 0, 1, 2, ... to each task in `ids`.
        Pinned tasks (sort_order < 0) are skipped — their pin is preserved.
        Tasks not in the list are left unchanged.
        """
        position = 0
        for task_id in ids:
            task = self.db.get(Task, task_id)
            if task is None:
                continue
            if task.sort_order is not None and task.sort_order < 0:
                continue  # Pinned task — preserve negative sort_order
            task.sort_order = position
            task.updated_at = _now()
            position += 1
        self.db.commit()

    # ── Dismiss (delete without Telegram reaction) ─────────────────────────

    def dismiss(self, task_id: int) -> None:
        """Delete a task without sending any reaction or reply to Telegram.

        Use when the task is irrelevant and no Telegram action is needed.

        Raises:
            HTTPException 404: task not found.
        """
        task = self._get_or_404(task_id)
        logger.info("Task dismissed | id=%d title=%.60r", task.id, task.title)
        self.db.delete(task)
        self.db.commit()

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
        logger.info("Clear done tasks | deleted=%d older_than_days=%d", count, older_than_days)
        return count

    def clear_inbox(self) -> int:
        """Delete all tasks currently in inbox status.

        Used as an emergency cleanup action when rules accidentally
        produced too many inbox tasks.
        Returns the number of deleted tasks.
        """
        q = self.db.query(Task).filter(Task.status == TaskStatus.inbox)
        count = q.count()
        q.delete(synchronize_session=False)
        self.db.commit()
        logger.info("Clear inbox tasks | deleted=%d", count)
        return count

    # ── Pin / unpin ────────────────────────────────────────────────────────

    def pin_task(self, task_id: int) -> Task:
        """Toggle pin state for an inbox task.

        Pinned tasks use sort_order = -1 so they appear above all DnD-ordered
        (sort_order >= 0) and unordered (sort_order = None) tasks.
        Calling pin on an already-pinned task unpins it (sort_order → None).

        Raises:
            HTTPException 404: task not found.
        """
        task = self._get_or_404(task_id)
        if task.sort_order is not None and task.sort_order < 0:
            # Already pinned → unpin
            task.sort_order = None
            logger.info("Task unpinned | id=%d", task.id)
        else:
            # Pin to top (below any other negative sort_order, e.g. -2, -3...)
            # Find the current minimum pinned sort_order and go one lower.
            min_pinned = (
                self.db.query(func.min(Task.sort_order))
                .filter(Task.status == TaskStatus.inbox, Task.sort_order < 0)
                .scalar()
            )
            task.sort_order = (min_pinned - 1) if min_pinned is not None else -1
            logger.info("Task pinned | id=%d sort_order=%d", task.id, task.sort_order)
        task.updated_at = _now()
        self.db.commit()
        self.db.refresh(task)
        return task

    # ── Work-in-progress marker (👀) ───────────────────────────────────────

    async def start_work(self, task_id: int) -> Task:
        """Toggle inbox task work state ("В работу" / "В работе").

        Behavior:
          - Works only for inbox tasks.
          - Toggle ON  -> in_progress=True, work_started_at=now, send 👀 reaction.
          - Toggle OFF -> in_progress=False, work_started_at=None, remove own reaction.

        Raises:
            HTTPException 404: task not found.
            HTTPException 409: task is not in inbox.
        """
        task = self._get_or_404(task_id)
        if task.status != TaskStatus.inbox:
            raise HTTPException(status_code=409, detail=f"Task {task_id} is not in inbox")

        enable = not bool(task.in_progress)

        mention_allowed = True
        reaction_attempted = False
        reaction_removed = False

        if task.chat_id and task.source_message_id:
            tg = TelegramService()
            try:
                if enable:
                    from ..config import get_settings

                    settings = get_settings()
                    mention_check_message_id = task.trigger_message_id or task.source_message_id
                    mention_allowed = await tg.message_mentions_handles(
                        chat_id=task.chat_id,
                        message_id=mention_check_message_id,
                        mention_handles=settings.get_mention_handles(),
                    )

                    if mention_allowed:
                        reaction_attempted = True
                        await tg.send_done(
                            chat_id=task.chat_id,
                            message_id=task.source_message_id,
                            reaction="👀",
                            send_reply=False,
                            reply_text="",
                        )
                    else:
                        logger.warning(
                            "Work reaction blocked (no mention) | task_id=%d chat=%s trigger_msg=%s",
                            task.id,
                            task.chat_id,
                            task.trigger_message_id or task.source_message_id,
                        )
                else:
                    reaction_attempted = True
                    remove_result = await tg.remove_done(
                        chat_id=task.chat_id,
                        message_id=task.source_message_id,
                        reply_message_id=None,
                    )
                    reaction_removed = bool(remove_result.get("reaction_removed"))
            except Exception as exc:
                logger.error("start_work reaction failed | task_id=%d err=%s", task.id, exc)

        now = _now()
        task.in_progress = enable
        task.work_started_at = now if enable else None
        task.updated_at = now

        self.db.add(Event(
            task_id=task.id,
            type=EventType.updated,
            payload_json=json.dumps({
                "action": "work_started" if enable else "work_stopped",
                "reaction": "👀",
                "reaction_attempted": reaction_attempted,
                "mention_allowed": mention_allowed,
                "reaction_removed": reaction_removed,
                "ts": now.isoformat(),
            }),
            ts=now,
        ))
        self.db.commit()
        self.db.refresh(task)
        return task

    # ── Helpers ────────────────────────────────────────────────────────────

    def _get_or_404(self, task_id: int) -> Task:
        task: Optional[Task] = self.db.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return task
