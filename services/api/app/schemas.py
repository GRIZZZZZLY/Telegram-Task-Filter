"""Pydantic v2 schemas for API request / response."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .models import EventType, TaskPriority, TaskStatus


class TaskOut(BaseModel):
    """Public representation of a Task."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    chat_id: Optional[str] = None
    thread_id: Optional[str] = None
    source_message_id: Optional[int] = None
    committed_at: Optional[datetime] = None
    snoozed_until: Optional[datetime] = None
    sort_order: Optional[int] = None
    custom_reply: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SnoozeIn(BaseModel):
    """Request body for POST /tasks/{id}/snooze."""
    minutes: int = Field(..., gt=0, le=14400, description="Snooze duration in minutes (max 10 days)")


class TaskListOut(BaseModel):
    """Paginated task list."""

    items: List[TaskOut]
    total: int


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    type: EventType
    payload_json: Optional[str] = None
    ts: datetime


class ReopenOut(BaseModel):
    """Response for POST /tasks/{id}/reopen."""

    task: TaskOut
    reaction_removed: bool
    reply_deleted: bool
    warnings: List[str] = []


class PriorityIn(BaseModel):
    """Request body for PATCH /tasks/{id}/priority."""
    priority: TaskPriority


class DoneIn(BaseModel):
    """Request body for POST /tasks/{id}/done — custom reply is optional."""
    custom_reply: Optional[str] = Field(default=None, max_length=500)


class ReorderIn(BaseModel):
    """Request body for POST /tasks/reorder — ordered list of task IDs."""
    ids: List[int]


class SettingsOut(BaseModel):
    """Public settings returned by GET /settings."""
    # Telegram
    tg_mention_handles: str
    tg_monitored_chat_ids: str
    tg_monitored_thread_ids: str
    # Reactions
    done_reaction: str
    done_send_reply: bool
    done_reply_text: str
    done_commit_delay_seconds: int
    # Filters
    filter_ignore_own: bool
    filter_min_text_length: int
    filter_strict_mentions: bool
    # Cleanup
    cleanup_done_after_days: int
    # UI
    sound_enabled: bool
    compact_mode: bool


class SettingsIn(BaseModel):
    """Partial update for PATCH /settings — all fields optional."""
    tg_mention_handles: Optional[str] = None
    tg_monitored_chat_ids: Optional[str] = None
    tg_monitored_thread_ids: Optional[str] = None
    done_reaction: Optional[str] = None
    done_send_reply: Optional[bool] = None
    done_reply_text: Optional[str] = None
    done_commit_delay_seconds: Optional[int] = Field(default=None, ge=0, le=60)
    filter_ignore_own: Optional[bool] = None
    filter_min_text_length: Optional[int] = Field(default=None, ge=0, le=2000)
    filter_strict_mentions: Optional[bool] = None
    cleanup_done_after_days: Optional[int] = Field(default=None, ge=0, le=365)
    sound_enabled: Optional[bool] = None
    compact_mode: Optional[bool] = None
