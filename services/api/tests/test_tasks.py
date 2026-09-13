"""Integration tests for /tasks endpoints.

Fixtures (db_session, client, reset_db) come from conftest.py.
All tests run against in-memory SQLite — no disk artifacts.
"""
import json

from sqlalchemy.orm import Session

from app.models import Event, EventType, Task, TaskPriority, TaskStatus


# ── Helpers ────────────────────────────────────────────────────────────────

def seed_task(
    db: Session,
    title: str = "Test task",
    status: TaskStatus = TaskStatus.inbox,
    priority: TaskPriority = TaskPriority.medium,
    chat_id: str = "-100123",
    source_message_id: int = 42,
) -> Task:
    t = Task(
        title=title,
        status=status,
        priority=priority,
        chat_id=chat_id,
        source_message_id=source_message_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def seed_reaction_event(db: Session, task: Task, reply_message_id: int | None = None) -> Event:
    """Simulate a reaction_sent event (as stage-2 worker would create)."""
    e = Event(
        task_id=task.id,
        type=EventType.reaction_sent,
        payload_json=json.dumps({
            "chat_id": task.chat_id,
            "source_message_id": task.source_message_id,
            "reaction": "✅",
            "reply_message_id": reply_message_id,
        }),
    )
    db.add(e)
    db.commit()
    return e


# ── GET /health ────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_returns_env(self, client):
        body = client.get("/health").json()
        assert "env" in body


# ── GET /tasks ──────────────────────────────────────────────────────────────

class TestListTasks:
    def test_empty_list(self, client):
        r = client.get("/tasks")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_returns_seeded_tasks(self, client, db_session):
        seed_task(db_session, "Task A")
        seed_task(db_session, "Task B")
        body = client.get("/tasks").json()
        assert body["total"] == 2
        assert len(body["items"]) == 2

    def test_filter_by_status(self, client, db_session):
        seed_task(db_session, "Inbox task", status=TaskStatus.inbox)
        seed_task(db_session, "Done task", status=TaskStatus.done)

        body = client.get("/tasks?status=inbox").json()
        assert body["total"] == 1
        assert body["items"][0]["status"] == "inbox"

    def test_filter_by_priority(self, client, db_session):
        seed_task(db_session, "High", priority=TaskPriority.high)
        seed_task(db_session, "Low", priority=TaskPriority.low)

        body = client.get("/tasks?priority=high").json()
        assert body["total"] == 1
        assert body["items"][0]["priority"] == "high"

    def test_filter_by_thread_id(self, client, db_session):
        t = Task(title="Thread task", status=TaskStatus.inbox,
                 priority=TaskPriority.medium, thread_id="173")
        db_session.add(t)
        seed_task(db_session, "No thread")
        db_session.commit()

        body = client.get("/tasks?thread_id=173").json()
        assert body["total"] == 1
        assert body["items"][0]["title"] == "Thread task"

    def test_pagination_limit(self, client, db_session):
        for i in range(5):
            seed_task(db_session, f"Task {i}")
        body = client.get("/tasks?limit=2&offset=0").json()
        assert len(body["items"]) == 2
        assert body["total"] == 5

    def test_pagination_offset(self, client, db_session):
        for i in range(5):
            seed_task(db_session, f"Task {i}")
        body = client.get("/tasks?limit=2&offset=4").json()
        assert len(body["items"]) == 1  # only 1 left after offset=4

    def test_invalid_limit_returns_422(self, client):
        r = client.get("/tasks?limit=0")
        assert r.status_code == 422

    def test_task_fields_present(self, client, db_session):
        seed_task(db_session, "Field check task")
        item = client.get("/tasks").json()["items"][0]
        expected_fields = {
            "id", "title", "status", "priority", "created_at", "updated_at",
            "trigger_message_id", "in_progress", "work_started_at", "source_changed", "source_edited_at",
        }
        assert expected_fields.issubset(item.keys())


# ── POST /tasks/{id}/pin ─────────────────────────────────────────────────────

class TestPinTask:
    def test_can_pin_more_than_two_tasks(self, client, db_session):
        t1 = seed_task(db_session, "Pin A")
        t2 = seed_task(db_session, "Pin B")
        t3 = seed_task(db_session, "Pin C")

        r1 = client.post(f"/tasks/{t1.id}/pin")
        r2 = client.post(f"/tasks/{t2.id}/pin")
        r3 = client.post(f"/tasks/{t3.id}/pin")

        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r3.status_code == 200

    def test_pinned_tasks_keep_negative_sort_order(self, client, db_session):
        t1 = seed_task(db_session, "Pin 1")
        t2 = seed_task(db_session, "Pin 2")
        t3 = seed_task(db_session, "Pin 3")

        client.post(f"/tasks/{t1.id}/pin")
        client.post(f"/tasks/{t2.id}/pin")
        client.post(f"/tasks/{t3.id}/pin")

        body = client.get("/tasks?status=inbox").json()
        pinned = [item for item in body["items"] if item["sort_order"] is not None and item["sort_order"] < 0]

        assert len(pinned) == 3


# ── POST /tasks/{id}/start-work ───────────────────────────────────────────────

class TestStartWork:
    def test_marks_task_in_progress(self, client, db_session):
        task = seed_task(db_session, "Work me")

        r = client.post(f"/tasks/{task.id}/start-work")
        assert r.status_code == 200
        body = r.json()
        assert body["in_progress"] is True
        assert body["work_started_at"] is not None

    def test_toggle_off_when_already_in_progress(self, client, db_session):
        task = seed_task(db_session, "Toggle")
        first = client.post(f"/tasks/{task.id}/start-work")
        second = client.post(f"/tasks/{task.id}/start-work")
        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["in_progress"] is True
        assert second.json()["in_progress"] is False
        assert second.json()["work_started_at"] is None

    def test_rejects_non_inbox(self, client, db_session):
        task = seed_task(db_session, "Done", status=TaskStatus.done)
        r = client.post(f"/tasks/{task.id}/start-work")
        assert r.status_code == 409


# ── POST /tasks/{id}/done ───────────────────────────────────────────────────

class TestMarkDone:
    def test_success(self, client, db_session):
        task = seed_task(db_session)
        r = client.post(f"/tasks/{task.id}/done")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "done"
        assert body["id"] == task.id

    def test_custom_reply_is_stored(self, client, db_session):
        """The body is optional, but when sent its text must reach the task."""
        task = seed_task(db_session)
        r = client.post(f"/tasks/{task.id}/done", json={"custom_reply": "сделал"})
        assert r.status_code == 200
        db_session.refresh(task)
        assert task.custom_reply == "сделал"

    def test_committed_at_is_set(self, client, db_session):
        task = seed_task(db_session)
        client.post(f"/tasks/{task.id}/done")
        db_session.refresh(task)
        assert task.committed_at is not None

    def test_done_event_created(self, client, db_session):
        task = seed_task(db_session)
        client.post(f"/tasks/{task.id}/done")

        event = (
            db_session.query(Event)
            .filter(Event.task_id == task.id, Event.type == EventType.done)
            .first()
        )
        assert event is not None

    def test_not_found_returns_404(self, client):
        r = client.post("/tasks/99999/done")
        assert r.status_code == 404

    def test_already_done_returns_409(self, client, db_session):
        task = seed_task(db_session, status=TaskStatus.done)
        r = client.post(f"/tasks/{task.id}/done")
        assert r.status_code == 409


# ── POST /tasks/{id}/reopen ─────────────────────────────────────────────────

class TestReopen:
    def test_success_returns_inbox(self, client, db_session):
        task = seed_task(db_session, status=TaskStatus.done)
        r = client.post(f"/tasks/{task.id}/reopen")
        assert r.status_code == 200
        body = r.json()
        assert body["task"]["status"] == "inbox"

    def test_reopened_event_created(self, client, db_session):
        task = seed_task(db_session, status=TaskStatus.done)
        client.post(f"/tasks/{task.id}/reopen")

        event = (
            db_session.query(Event)
            .filter(Event.task_id == task.id, Event.type == EventType.reopened)
            .first()
        )
        assert event is not None

    def test_committed_at_cleared(self, client, db_session):
        task = seed_task(db_session, status=TaskStatus.done)
        # Manually set committed_at to simulate sent reaction
        from datetime import datetime, timezone
        task.committed_at = datetime.now(timezone.utc)
        db_session.commit()

        client.post(f"/tasks/{task.id}/reopen")
        db_session.refresh(task)
        assert task.committed_at is None

    def test_reopen_response_has_reaction_fields(self, client, db_session):
        """Response contains reaction_removed and reply_deleted fields.

        In tests Telethon is not connected → reaction_removed=False (correct).
        With a live Telegram session it would be True.
        """
        task = seed_task(db_session, status=TaskStatus.done)
        seed_reaction_event(db_session, task)
        body = client.post(f"/tasks/{task.id}/reopen").json()
        assert "reaction_removed" in body
        assert "reply_deleted" in body
        assert isinstance(body["reaction_removed"], bool)
        assert isinstance(body["reply_deleted"], bool)

    def test_no_reaction_event_still_works(self, client, db_session):
        """Task without reaction_sent event reopens cleanly."""
        task = seed_task(db_session, status=TaskStatus.done)
        r = client.post(f"/tasks/{task.id}/reopen")
        assert r.status_code == 200
        assert r.json()["task"]["status"] == "inbox"

    def test_warnings_when_reply_message_id_set(self, client, db_session):
        """When reply_message_id is stored and stub can't delete → warning returned."""
        task = seed_task(db_session, status=TaskStatus.done)
        seed_reaction_event(db_session, task, reply_message_id=789)
        body = client.post(f"/tasks/{task.id}/reopen").json()
        assert len(body["warnings"]) > 0

    def test_not_found_returns_404(self, client):
        r = client.post("/tasks/99999/reopen")
        assert r.status_code == 404

    def test_already_inbox_returns_409(self, client, db_session):
        task = seed_task(db_session, status=TaskStatus.inbox)
        r = client.post(f"/tasks/{task.id}/reopen")
        assert r.status_code == 409
