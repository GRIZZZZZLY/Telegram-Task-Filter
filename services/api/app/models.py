"""SQLAlchemy ORM models: Task and Event."""
import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, relationship


def _now() -> datetime:
    """UTC-aware current timestamp. Avoids deprecated datetime.utcnow()."""
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ── Enums ─────────────────────────────────────────────────────────────────


class TaskStatus(str, enum.Enum):
    inbox = "inbox"
    done = "done"
    snoozed = "snoozed"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class EventType(str, enum.Enum):
    created = "created"
    updated = "updated"
    done = "done"
    reaction_sent = "reaction_sent"
    reopened = "reopened"
    snoozed = "snoozed"
    woken = "woken"
    error = "error"


# ── Models ────────────────────────────────────────────────────────────────


class Task(Base):
    """A task extracted from a Telegram message."""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.inbox, nullable=False)
    priority = Column(Enum(TaskPriority), default=TaskPriority.medium, nullable=False)

    # Telegram source info
    chat_id = Column(String(100), nullable=True, index=True)
    thread_id = Column(String(100), nullable=True, index=True)
    source_message_id = Column(Integer, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    # Staged-commit: NULL = reaction not yet sent, NOT NULL = reaction pending/sent
    committed_at = Column(DateTime(timezone=True), nullable=True)

    # Snooze: NULL = not snoozed, NOT NULL = wake up at this UTC time
    snoozed_until = Column(DateTime(timezone=True), nullable=True)

    # Manual sort order within inbox (lower = higher in list). NULL = use created_at order.
    sort_order = Column(Integer, nullable=True, index=True)

    # Custom reply text override (NULL = use settings default)
    custom_reply = Column(String(500), nullable=True)

    events = relationship("Event", back_populates="task", cascade="all, delete-orphan")


class Event(Base):
    """Audit log for task lifecycle actions."""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum(EventType), nullable=False)
    payload_json = Column(Text, nullable=True)  # arbitrary JSON blob
    ts = Column(DateTime(timezone=True), default=_now, nullable=False)

    task = relationship("Task", back_populates="events")
