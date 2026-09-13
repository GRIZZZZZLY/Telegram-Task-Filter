"""Tests for GET /stats endpoint."""
import itertools
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.models import Task, TaskPriority, TaskStatus
from app.tz import MSK


# ── Helpers ────────────────────────────────────────────────────────────────

def _now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _minutes_into_today() -> float:
    """Minutes ago for a moment safely inside the current local day.

    "10 minutes ago" is not always today: just after local midnight it lands
    on yesterday and the period tests fail for reasons that have nothing to
    do with the code under test. Half the elapsed day is always inside it.
    """
    now_local = datetime.now(MSK)
    midnight = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1.0, (now_local - midnight).total_seconds() / 120)


def _minutes_into_this_week() -> float:
    """Same idea for the current local week, which starts Monday 00:00."""
    now_local = datetime.now(MSK)
    week_start = (now_local - timedelta(days=now_local.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return max(1.0, (now_local - week_start).total_seconds() / 120)


_MESSAGE_IDS = itertools.count(1000)


def seed(
    db: Session,
    *,
    title: str = "Task",
    status: TaskStatus = TaskStatus.inbox,
    priority: TaskPriority = TaskPriority.normal,
    chat_id: str = "-100111",
    thread_id: str | None = None,
    sender_id: str | None = "111",
    sender_username: str | None = "@alice",
    created_ago_minutes: int = 0,
    committed_ago_minutes: int | None = None,
) -> Task:
    created_at = _now_naive() - timedelta(minutes=created_ago_minutes)
    committed_at = (
        _now_naive() - timedelta(minutes=committed_ago_minutes)
        if committed_ago_minutes is not None
        else None
    )
    t = Task(
        title=title,
        status=status,
        priority=priority,
        chat_id=chat_id,
        thread_id=thread_id,
        # Own message per task: the tasks table forbids two tasks sharing
        # one (chat_id, source_message_id). Hashing the title collided
        # whenever two tasks were seeded with the same defaults.
        source_message_id=next(_MESSAGE_IDS),
        sender_id=sender_id,
        sender_username=sender_username,
        created_at=created_at,
        committed_at=committed_at,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# ── Tests ──────────────────────────────────────────────────────────────────

class TestStatsEmpty:
    def test_empty_db_returns_zeros(self, client):
        r = client.get("/stats?period=all")
        assert r.status_code == 200
        data = r.json()
        assert data["summary"]["total"] == 0
        assert data["summary"]["done"] == 0
        assert data["by_chat"] == []
        assert data["by_sender"] == []
        assert data["by_day"] == []


class TestStatsSummary:
    def test_counts_tasks_in_window(self, client, db_session):
        seed(db_session, status=TaskStatus.inbox,   created_ago_minutes=10)
        seed(db_session, status=TaskStatus.done,    created_ago_minutes=20,
             committed_ago_minutes=5)
        seed(db_session, status=TaskStatus.snoozed, created_ago_minutes=30)

        r = client.get("/stats?period=all")
        assert r.status_code == 200
        s = r.json()["summary"]
        assert s["total"]   == 3
        assert s["inbox"]   == 1
        assert s["done"]    == 1
        assert s["snoozed"] == 1

    def test_avg_completion_minutes(self, client, db_session):
        # committed 60 min after creation
        seed(db_session, status=TaskStatus.done,
             created_ago_minutes=120, committed_ago_minutes=60)
        # committed 30 min after creation
        seed(db_session, status=TaskStatus.done,
             created_ago_minutes=90, committed_ago_minutes=60)

        r = client.get("/stats?period=all")
        s = r.json()["summary"]
        # First task: 60 min completion; second: 30 min completion → avg 45
        assert s["avg_completion_minutes"] == pytest.approx(45.0, rel=0.05)

    def test_avg_completion_none_when_no_done(self, client, db_session):
        seed(db_session, status=TaskStatus.inbox)
        r = client.get("/stats?period=all")
        assert r.json()["summary"]["avg_completion_minutes"] is None


class TestStatsByChat:
    def test_groups_by_chat(self, client, db_session):
        seed(db_session, chat_id="-100111")
        seed(db_session, chat_id="-100111")
        seed(db_session, chat_id="-100222")

        r = client.get("/stats?period=all")
        by_chat = {c["chat_id"]: c["count"] for c in r.json()["by_chat"]}
        assert by_chat["-100111"] == 2
        assert by_chat["-100222"] == 1

    def test_sorted_by_count_desc(self, client, db_session):
        seed(db_session, chat_id="-100aaa")
        seed(db_session, chat_id="-100bbb")
        seed(db_session, chat_id="-100bbb")

        chats = r.json()["by_chat"] if (r := client.get("/stats?period=all")) else []
        r = client.get("/stats?period=all")
        chats = r.json()["by_chat"]
        assert chats[0]["chat_id"] == "-100bbb"
        assert chats[0]["count"] == 2


class TestStatsByThread:
    def test_groups_by_thread(self, client, db_session):
        seed(db_session, chat_id="-100111", thread_id="10")
        seed(db_session, chat_id="-100111", thread_id="10")
        seed(db_session, chat_id="-100111", thread_id="20")
        seed(db_session, chat_id="-100111", thread_id=None)  # no thread

        r = client.get("/stats?period=all")
        threads = r.json()["by_thread"]
        # Only tasks with thread_id appear
        assert len(threads) == 2
        tid_counts = {t["thread_id"]: t["count"] for t in threads}
        assert tid_counts["10"] == 2
        assert tid_counts["20"] == 1


class TestStatsBySender:
    def test_groups_by_sender(self, client, db_session):
        seed(db_session, sender_id="111", sender_username="@alice")
        seed(db_session, sender_id="111", sender_username="@alice")
        seed(db_session, sender_id="222", sender_username="@bob")

        r = client.get("/stats?period=all")
        senders = {s["sender_id"]: s for s in r.json()["by_sender"]}
        assert senders["111"]["count"] == 2
        assert senders["111"]["sender_username"] == "@alice"
        assert senders["222"]["count"] == 1

    def test_no_sender_excluded(self, client, db_session):
        seed(db_session, sender_id=None, sender_username=None)
        r = client.get("/stats?period=all")
        assert r.json()["by_sender"] == []


class TestStatsByPriority:
    def test_counts_each_priority(self, client, db_session):
        seed(db_session, priority=TaskPriority.normal)
        seed(db_session, priority=TaskPriority.normal)
        seed(db_session, priority=TaskPriority.high)
        seed(db_session, priority=TaskPriority.medium)
        seed(db_session, priority=TaskPriority.low)

        r = client.get("/stats?period=all")
        p = r.json()["by_priority"]
        assert p["normal"] == 2
        assert p["high"]   == 1
        assert p["medium"] == 1
        assert p["low"]    == 1


class TestStatsByDay:
    def test_groups_created_by_day(self, client, db_session):
        # Two tasks created "now" (same day), one created 2 days ago
        seed(db_session, created_ago_minutes=10)
        seed(db_session, created_ago_minutes=30)
        seed(db_session, created_ago_minutes=60 * 24 * 2)

        r = client.get("/stats?period=all")
        by_day = r.json()["by_day"]
        # Should have at least 2 distinct dates
        assert len(by_day) >= 2
        # Today's entry should have count 2
        today_entry = by_day[-1]
        assert today_entry["created"] == 2

    def test_done_counted_by_committed_date(self, client, db_session):
        # Task created and committed today
        seed(db_session, status=TaskStatus.done,
             created_ago_minutes=60, committed_ago_minutes=10)

        r = client.get("/stats?period=all")
        by_day = r.json()["by_day"]
        today = by_day[-1]
        assert today["done"] == 1


class TestStatsPeriodFiltering:
    def test_today_excludes_old_tasks(self, client, db_session):
        seed(db_session, created_ago_minutes=_minutes_into_today())   # today
        seed(db_session, created_ago_minutes=60 * 25)     # yesterday

        r = client.get("/stats?period=today")
        assert r.json()["summary"]["total"] == 1

    def test_week_includes_this_week(self, client, db_session):
        seed(db_session, created_ago_minutes=_minutes_into_this_week())  # this week
        seed(db_session, created_ago_minutes=60 * 24 * 8)  # 8 days ago → last week

        r = client.get("/stats?period=week")
        assert r.json()["summary"]["total"] == 1

    def test_custom_period(self, client, db_session):
        seed(db_session, created_ago_minutes=60)

        r = client.get("/stats?period=custom&from_date=2020-01-01&to_date=2019-01-01")
        # Invalid range → no tasks
        assert r.json()["summary"]["total"] == 0

    def test_all_includes_everything(self, client, db_session):
        seed(db_session, created_ago_minutes=60 * 24 * 365)  # 1 year ago
        seed(db_session, created_ago_minutes=10)

        r = client.get("/stats?period=all")
        assert r.json()["summary"]["total"] == 2
