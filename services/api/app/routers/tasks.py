"""Tasks router.

Endpoints:
  GET  /tasks              — list with filters + pagination
  POST /tasks/{id}/done    — mark done (staged-commit)
  POST /tasks/{id}/reopen  — undo done (removes TG reaction + reply)
  POST /tasks/{id}/snooze  — snooze task for N minutes
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import TaskPriority, TaskStatus
from ..schemas import DoneIn, PriorityIn, ReorderIn, ReopenOut, SnoozeIn, TaskListOut, TaskOut
from ..services.notification_service import manager
from ..services.task_service import TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskListOut, summary="List tasks")
def list_tasks(
    status: Optional[TaskStatus] = Query(None, description="Filter by status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by priority"),
    thread_id: Optional[str] = Query(None, description="Telegram thread / topic ID"),
    limit: int = Query(50, ge=1, le=200, description="Page size"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: Session = Depends(get_db),
) -> Any:
    """Return paginated tasks with optional filters. Ordered newest first."""
    svc = TaskService(db)
    items, total = svc.get_tasks(status, priority, thread_id, limit, offset)
    # Return dict — FastAPI serialises ORM objects via response_model + from_attributes
    return {"items": items, "total": total}


@router.post("/{task_id}/done", response_model=TaskOut, summary="Mark task done")
def mark_task_done(task_id: int, body: DoneIn = DoneIn(), db: Session = Depends(get_db)) -> Any:
    """Mark task as done. Writes a 'done' event. Sets committed_at timestamp.

    The Telegram reaction is sent after the staged-commit delay window (stage 2).
    Optional `custom_reply` overrides the default reply text from settings.

    - **404** task not found
    - **409** task already done
    """
    svc = TaskService(db)
    return svc.mark_done(task_id, custom_reply=body.custom_reply)


@router.post("/reorder", summary="Reorder inbox tasks")
def reorder_tasks(body: ReorderIn, db: Session = Depends(get_db)) -> dict:
    """Persist manual drag-and-drop order for inbox tasks.

    Accepts an ordered list of task IDs (first = top of list).
    """
    svc = TaskService(db)
    svc.reorder(body.ids)
    return {"ok": True}


@router.post("/{task_id}/snooze", response_model=TaskOut, summary="Snooze task")
def snooze_task(task_id: int, body: SnoozeIn, db: Session = Depends(get_db)) -> Any:
    """Snooze a task for `minutes` minutes. It will return to inbox automatically.

    - **404** task not found
    - **409** task is already done
    """
    svc = TaskService(db)
    return svc.snooze(task_id, body.minutes)


@router.patch("/{task_id}/priority", response_model=TaskOut, summary="Change task priority")
def change_task_priority(task_id: int, body: PriorityIn, db: Session = Depends(get_db)) -> Any:
    """Change priority of a task (any status). Immediately visible in UI.

    - **404** task not found
    """
    svc = TaskService(db)
    return svc.change_priority(task_id, body.priority)


@router.delete("/done", summary="Delete all done tasks")
async def delete_done_tasks(
    older_than_days: int = Query(0, ge=0, description="Only delete tasks older than N days (0 = all)"),
    db: Session = Depends(get_db),
) -> dict:
    """Delete all done tasks or only those older than N days.

    Returns { deleted: N }
    """
    svc = TaskService(db)
    count = svc.clear_done(older_than_days)
    await manager.broadcast("done_cleared", {"deleted": count})
    return {"deleted": count}


@router.delete("/inbox", summary="Delete all inbox tasks")
async def delete_inbox_tasks(db: Session = Depends(get_db)) -> dict:
    """Delete all inbox tasks.

    Safety note: this only removes local tasks from SQLite.
    No Telegram reactions or replies are sent.

    Returns { deleted: N }.
    """
    svc = TaskService(db)
    count = svc.clear_inbox()
    await manager.broadcast("inbox_cleared", {"deleted": count})
    return {"deleted": count}


@router.post("/{task_id}/dismiss", summary="Dismiss task without Telegram action")
def dismiss_task(task_id: int, db: Session = Depends(get_db)) -> dict:
    """Delete a task silently — no reaction or reply sent to Telegram.

    Use when the task is irrelevant and no Telegram action is needed.

    - **404** task not found
    """
    svc = TaskService(db)
    svc.dismiss(task_id)
    return {"ok": True, "deleted": task_id}


@router.post("/{task_id}/pin", response_model=TaskOut, summary="Pin/unpin task to top of inbox")
def pin_task(task_id: int, db: Session = Depends(get_db)) -> Any:
    """Toggle pin state for an inbox task.

    Pinned tasks appear above all others (sort_order = -1 or lower).
    Calling pin on an already-pinned task unpins it (sort_order → None).

    - **404** task not found
    """
    svc = TaskService(db)
    return svc.pin_task(task_id)


@router.post("/{task_id}/reopen", response_model=ReopenOut, summary="Reopen done task")
async def reopen_task(task_id: int, db: Session = Depends(get_db)) -> Any:
    """Return task to inbox. Removes Telegram reaction and reply message (if sent by app).

    - **404** task not found
    - **409** task already in inbox
    - **warnings[]** populated when reply message could not be deleted (>48h or no permissions)
    """
    svc = TaskService(db)
    result = await svc.reopen(task_id)
    return ReopenOut(
        task=result["task"],
        reaction_removed=result["reaction_removed"],
        reply_deleted=result["reply_deleted"],
        warnings=result["warnings"],
    )
