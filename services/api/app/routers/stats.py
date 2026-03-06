"""Statistics router.

GET /stats?period=today|week|all|custom&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD

Returns aggregated task statistics for the requested time window.
All filtering is done in Python (not SQL) to avoid SQLite timezone
comparison pitfalls — acceptable for a personal tool with <10k tasks.
"""
import logging
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Task, TaskPriority, TaskStatus
from ..tz import MSK

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stats", tags=["stats"])


# ── Response schemas ──────────────────────────────────────────────────────────

class PeriodOut(BaseModel):
    from_dt: str
    to_dt: str


class SummaryOut(BaseModel):
    total: int
    done: int
    inbox: int
    snoozed: int
    avg_completion_minutes: Optional[float] = None


class ChatStatOut(BaseModel):
    chat_id: str
    count: int


class ThreadStatOut(BaseModel):
    chat_id: str
    thread_id: str
    count: int


class SenderStatOut(BaseModel):
    sender_id: str
    sender_username: Optional[str] = None
    count: int


class PriorityStatOut(BaseModel):
    normal: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0


class DayStatOut(BaseModel):
    date: str       # YYYY-MM-DD in requested timezone
    created: int
    done: int


class StatsOut(BaseModel):
    period: PeriodOut
    summary: SummaryOut
    by_chat: list[ChatStatOut]
    by_thread: list[ThreadStatOut]
    by_sender: list[SenderStatOut]
    by_priority: PriorityStatOut
    by_day: list[DayStatOut]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_naive_utc(dt: datetime | None) -> datetime | None:
    """Normalise a datetime to naive UTC for safe comparisons."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt  # assume already naive UTC


def _resolve_tz(tz_name: Optional[str]):
    """Resolve requested IANA timezone; fallback to MSK on invalid/missing."""
    if not tz_name:
        return MSK
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        logger.warning("Stats: unknown timezone %r, fallback to MSK", tz_name)
        return MSK


def _parse_period(
    period: str,
    from_date: Optional[str],
    to_date: Optional[str],
    local_tz,
) -> tuple[datetime, datetime]:
    """Return (from_dt, to_dt) as naive UTC datetimes."""
    now_local = datetime.now(local_tz)
    now_utc_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    if period == "today":
        today_local_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        from_dt = today_local_start.astimezone(timezone.utc).replace(tzinfo=None)
        to_dt = now_utc_naive

    elif period == "week":
        # Monday 00:00 in requested local timezone
        week_start_local = now_local - timedelta(days=now_local.weekday())
        week_start_local = week_start_local.replace(hour=0, minute=0, second=0, microsecond=0)
        from_dt = week_start_local.astimezone(timezone.utc).replace(tzinfo=None)
        to_dt = now_utc_naive

    elif period == "custom" and from_date and to_date:
        try:
            from_local = datetime.fromisoformat(from_date).replace(
                hour=0, minute=0, second=0, microsecond=0, tzinfo=local_tz
            )
            to_local = datetime.fromisoformat(to_date).replace(
                hour=23, minute=59, second=59, microsecond=999999, tzinfo=local_tz
            )
            from_dt = from_local.astimezone(timezone.utc).replace(tzinfo=None)
            to_dt = to_local.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            from_dt = datetime(2020, 1, 1)
            to_dt = now_utc_naive

    else:  # "all" or fallback
        from_dt = datetime(2020, 1, 1)
        to_dt = now_utc_naive

    return from_dt, to_dt


def _in_window(dt: datetime | None, from_dt: datetime, to_dt: datetime) -> bool:
    """Return True if dt falls within [from_dt, to_dt]."""
    naive = _to_naive_utc(dt)
    if naive is None:
        return False
    return from_dt <= naive <= to_dt


def _local_date_str(dt: datetime | None, local_tz) -> str | None:
    """Return YYYY-MM-DD string in requested local timezone, or None."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(local_tz).strftime("%Y-%m-%d")


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("", response_model=StatsOut, summary="Task statistics")
def get_stats(
    period: str = Query("week", description="today | week | all | custom"),
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD (for custom period)"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD (for custom period)"),
    tz: Optional[str] = Query(None, description="IANA timezone, e.g. Europe/Berlin"),
    db: Session = Depends(get_db),
) -> StatsOut:
    """Return aggregated statistics for tasks created in the requested period."""

    local_tz = _resolve_tz(tz)
    from_dt, to_dt = _parse_period(period, from_date, to_date, local_tz)

    # Fetch all tasks from DB — small dataset, Python-side filtering is fine
    all_tasks: list[Task] = db.query(Task).all()

    # Tasks created within the window
    window_tasks = [t for t in all_tasks if _in_window(t.created_at, from_dt, to_dt)]

    # ── Summary ───────────────────────────────────────────────────────────────
    done_tasks   = [t for t in window_tasks if t.status == TaskStatus.done]
    inbox_tasks  = [t for t in window_tasks if t.status == TaskStatus.inbox]
    snooze_tasks = [t for t in window_tasks if t.status == TaskStatus.snoozed]

    # Average completion time (created_at → committed_at) for done tasks in window
    completion_minutes: list[float] = []
    for t in done_tasks:
        c_naive = _to_naive_utc(t.committed_at)
        a_naive = _to_naive_utc(t.created_at)
        if c_naive and a_naive and c_naive > a_naive:
            completion_minutes.append((c_naive - a_naive).total_seconds() / 60)

    avg_completion = (
        round(sum(completion_minutes) / len(completion_minutes), 1)
        if completion_minutes
        else None
    )

    summary = SummaryOut(
        total=len(window_tasks),
        done=len(done_tasks),
        inbox=len(inbox_tasks),
        snoozed=len(snooze_tasks),
        avg_completion_minutes=avg_completion,
    )

    # ── By chat ───────────────────────────────────────────────────────────────
    chat_counter: Counter[str] = Counter(
        t.chat_id for t in window_tasks if t.chat_id
    )
    by_chat = [
        ChatStatOut(chat_id=cid, count=cnt)
        for cid, cnt in chat_counter.most_common(20)
    ]

    # ── By thread ─────────────────────────────────────────────────────────────
    thread_counter: Counter[tuple[str, str]] = Counter(
        (t.chat_id or "", t.thread_id)
        for t in window_tasks
        if t.thread_id
    )
    by_thread = [
        ThreadStatOut(chat_id=cid, thread_id=tid, count=cnt)
        for (cid, tid), cnt in thread_counter.most_common(20)
    ]

    # ── By sender ─────────────────────────────────────────────────────────────
    # Group by sender_id, pick the most recent username for display
    sender_counts: Counter[str] = Counter(
        t.sender_id for t in window_tasks if t.sender_id
    )
    sender_username_map: dict[str, str | None] = {}
    for t in window_tasks:
        if t.sender_id and t.sender_id not in sender_username_map:
            sender_username_map[t.sender_id] = t.sender_username

    by_sender = [
        SenderStatOut(
            sender_id=sid,
            sender_username=sender_username_map.get(sid),
            count=cnt,
        )
        for sid, cnt in sender_counts.most_common(20)
    ]

    # ── By priority ───────────────────────────────────────────────────────────
    prio_counter: Counter[str] = Counter(
        t.priority.value for t in window_tasks
    )
    by_priority = PriorityStatOut(
        normal=prio_counter.get(TaskPriority.normal.value, 0),
        high=prio_counter.get(TaskPriority.high.value, 0),
        medium=prio_counter.get(TaskPriority.medium.value, 0),
        low=prio_counter.get(TaskPriority.low.value, 0),
    )

    # ── By day ────────────────────────────────────────────────────────────────
    # Build a date range from from_dt to to_dt in requested timezone
    from_local_date = (
        from_dt.replace(tzinfo=timezone.utc).astimezone(local_tz).date()
        if from_dt != datetime(2020, 1, 1) else None
    )
    to_local_date = to_dt.replace(tzinfo=timezone.utc).astimezone(local_tz).date()

    # Determine actual date range from the data (cap "all" to first task)
    if window_tasks:
        earliest = min(
            (_to_naive_utc(t.created_at) for t in window_tasks if t.created_at),
            default=None,
        )
        if earliest and (from_local_date is None or
                         earliest.replace(tzinfo=timezone.utc).astimezone(local_tz).date() < from_local_date):
            from_local_date = earliest.replace(tzinfo=timezone.utc).astimezone(local_tz).date()

    if from_local_date is None:
        from_local_date = to_local_date

    # Count created and done per local day
    created_by_day: Counter[str] = Counter()
    done_by_day: Counter[str] = Counter()

    for t in window_tasks:
        d = _local_date_str(t.created_at, local_tz)
        if d:
            created_by_day[d] += 1

    # Done tasks: count by committed_at date (may be outside the window)
    # Use all done tasks committed within to_dt for accurate "done per day"
    all_committed = [
        t for t in all_tasks
        if t.committed_at and _in_window(t.committed_at, from_dt, to_dt)
    ]
    for t in all_committed:
        d = _local_date_str(t.committed_at, local_tz)
        if d:
            done_by_day[d] += 1

    # Build sorted list of all dates in range
    all_dates: list[str] = []
    cursor = from_local_date
    while cursor <= to_local_date:
        all_dates.append(cursor.strftime("%Y-%m-%d"))
        cursor += timedelta(days=1)

    by_day = [
        DayStatOut(
            date=d,
            created=created_by_day.get(d, 0),
            done=done_by_day.get(d, 0),
        )
        for d in all_dates
        if created_by_day.get(d, 0) > 0 or done_by_day.get(d, 0) > 0
    ]

    return StatsOut(
        period=PeriodOut(
            from_dt=from_dt.isoformat(),
            to_dt=to_dt.isoformat(),
        ),
        summary=summary,
        by_chat=by_chat,
        by_thread=by_thread,
        by_sender=by_sender,
        by_priority=by_priority,
        by_day=by_day,
    )
