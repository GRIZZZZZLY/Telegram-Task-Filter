"""Integration tests for /settings, PATCH /tasks/{id}/priority,
DELETE /tasks/done, and POST /tasks/{id}/snooze endpoints.

All tests run against in-memory SQLite — no disk artifacts.
Settings tests patch get_settings / save_settings to avoid touching .env.
"""
import itertools
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.orm import Session

from app.models import Task, TaskPriority, TaskStatus


# ── Helpers ────────────────────────────────────────────────────────────────

_MESSAGE_IDS = itertools.count(1000)


def seed_task(
    db: Session,
    title: str = "Test task",
    status: TaskStatus = TaskStatus.inbox,
    priority: TaskPriority = TaskPriority.medium,
    chat_id: str = "-100123",
    source_message_id: int | None = None,
) -> Task:
    # Each task gets its own Telegram message: the tasks table forbids
    # two tasks sharing one (chat_id, source_message_id).
    if source_message_id is None:
        source_message_id = next(_MESSAGE_IDS)
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


# ── GET /settings ──────────────────────────────────────────────────────────

class TestGetSettings:
    def test_returns_200(self, client):
        r = client.get("/settings")
        assert r.status_code == 200

    def test_response_has_required_fields(self, client):
        body = client.get("/settings").json()
        required = {
            "tg_mention_handles",
            "tg_monitored_chat_ids",
            "done_reaction",
            "done_send_reply",
            "done_reply_text",
            "done_commit_delay_seconds",
            "filter_ignore_own",
            "filter_min_text_length",
            "filter_strict_mentions",
            "cleanup_done_after_days",
            "sound_enabled",
            "compact_mode",
        }
        assert required.issubset(body.keys())

    def test_boolean_fields_are_bool(self, client):
        body = client.get("/settings").json()
        for field in ("done_send_reply", "filter_ignore_own", "filter_strict_mentions",
                      "sound_enabled", "compact_mode"):
            assert isinstance(body[field], bool), f"{field} should be bool"

    def test_integer_fields_are_int(self, client):
        body = client.get("/settings").json()
        for field in ("done_commit_delay_seconds", "filter_min_text_length",
                      "cleanup_done_after_days"):
            assert isinstance(body[field], int), f"{field} should be int"


# ── PATCH /settings ────────────────────────────────────────────────────────

class TestPatchSettings:
    def _patch_save(self):
        """Context manager that stubs save_settings to avoid writing .env."""
        return patch("app.routers.settings.save_settings", return_value=None)

    def test_patch_compact_mode(self, client):
        with self._patch_save():
            r = client.patch("/settings", json={"compact_mode": True})
        assert r.status_code == 200

    def test_patch_returns_settings_shape(self, client):
        with self._patch_save():
            body = client.patch("/settings", json={"sound_enabled": False}).json()
        assert "sound_enabled" in body
        assert "compact_mode" in body

    def test_patch_empty_body_is_noop(self, client):
        """Empty PATCH should not call save_settings and return 200."""
        with patch("app.routers.settings.save_settings") as mock_save:
            r = client.patch("/settings", json={})
        assert r.status_code == 200
        mock_save.assert_not_called()

    def test_patch_invalid_delay_returns_422(self, client):
        """done_commit_delay_seconds must be 0..60."""
        r = client.patch("/settings", json={"done_commit_delay_seconds": 999})
        assert r.status_code == 422

    def test_patch_invalid_min_text_length_returns_422(self, client):
        """filter_min_text_length must be 0..2000."""
        r = client.patch("/settings", json={"filter_min_text_length": -1})
        assert r.status_code == 422

    def test_patch_calls_save_settings_with_non_none_fields(self, client):
        """Only non-None fields should be passed to save_settings."""
        with patch("app.routers.settings.save_settings") as mock_save:
            client.patch("/settings", json={"compact_mode": True, "sound_enabled": None})
        # sound_enabled=None should be filtered out
        mock_save.assert_called_once()
        call_kwargs = mock_save.call_args[0][0]
        assert "compact_mode" in call_kwargs
        assert "sound_enabled" not in call_kwargs


# ── PATCH /tasks/{id}/priority ─────────────────────────────────────────────

class TestChangePriority:
    def test_change_to_high(self, client, db_session):
        task = seed_task(db_session, priority=TaskPriority.low)
        r = client.patch(f"/tasks/{task.id}/priority", json={"priority": "high"})
        assert r.status_code == 200
        assert r.json()["priority"] == "high"

    def test_change_to_low(self, client, db_session):
        task = seed_task(db_session, priority=TaskPriority.high)
        r = client.patch(f"/tasks/{task.id}/priority", json={"priority": "low"})
        assert r.status_code == 200
        assert r.json()["priority"] == "low"

    def test_change_to_medium(self, client, db_session):
        task = seed_task(db_session, priority=TaskPriority.high)
        r = client.patch(f"/tasks/{task.id}/priority", json={"priority": "medium"})
        assert r.status_code == 200
        assert r.json()["priority"] == "medium"

    def test_not_found_returns_404(self, client):
        r = client.patch("/tasks/99999/priority", json={"priority": "high"})
        assert r.status_code == 404

    def test_invalid_priority_returns_422(self, client, db_session):
        task = seed_task(db_session)
        r = client.patch(f"/tasks/{task.id}/priority", json={"priority": "urgent"})
        assert r.status_code == 422

    def test_priority_persisted_in_db(self, client, db_session):
        task = seed_task(db_session, priority=TaskPriority.low)
        client.patch(f"/tasks/{task.id}/priority", json={"priority": "high"})
        db_session.refresh(task)
        assert task.priority == TaskPriority.high

    def test_done_task_priority_can_change(self, client, db_session):
        """Priority change is allowed regardless of task status."""
        task = seed_task(db_session, status=TaskStatus.done, priority=TaskPriority.low)
        r = client.patch(f"/tasks/{task.id}/priority", json={"priority": "high"})
        assert r.status_code == 200
        assert r.json()["priority"] == "high"

    def test_response_has_task_fields(self, client, db_session):
        task = seed_task(db_session)
        body = client.patch(f"/tasks/{task.id}/priority", json={"priority": "high"}).json()
        assert {"id", "title", "status", "priority", "created_at"}.issubset(body.keys())


# ── DELETE /tasks/done ─────────────────────────────────────────────────────

class TestDeleteDone:
    def test_deletes_all_done_tasks(self, client, db_session):
        seed_task(db_session, status=TaskStatus.done)
        seed_task(db_session, status=TaskStatus.done)
        seed_task(db_session, status=TaskStatus.inbox)  # should NOT be deleted

        r = client.delete("/tasks/done")
        assert r.status_code == 200
        assert r.json()["deleted"] == 2

    def test_inbox_tasks_not_deleted(self, client, db_session):
        seed_task(db_session, status=TaskStatus.inbox)
        r = client.delete("/tasks/done")
        assert r.json()["deleted"] == 0

    def test_empty_db_returns_zero(self, client):
        r = client.delete("/tasks/done")
        assert r.status_code == 200
        assert r.json()["deleted"] == 0

    def test_older_than_days_filter(self, client, db_session):
        """older_than_days=999 → nothing deleted (tasks are brand new)."""
        seed_task(db_session, status=TaskStatus.done)
        r = client.delete("/tasks/done?older_than_days=999")
        assert r.json()["deleted"] == 0

    def test_older_than_days_zero_deletes_all(self, client, db_session):
        """older_than_days=0 (default) → delete all done tasks."""
        seed_task(db_session, status=TaskStatus.done)
        seed_task(db_session, status=TaskStatus.done)
        r = client.delete("/tasks/done?older_than_days=0")
        assert r.json()["deleted"] == 2

    def test_tasks_removed_from_db(self, client, db_session):
        seed_task(db_session, status=TaskStatus.done)
        client.delete("/tasks/done")
        remaining = db_session.query(Task).filter(Task.status == TaskStatus.done).count()
        assert remaining == 0

    def test_invalid_older_than_days_returns_422(self, client):
        r = client.delete("/tasks/done?older_than_days=-1")
        assert r.status_code == 422


# ── POST /tasks/{id}/snooze ────────────────────────────────────────────────

class TestSnooze:
    def test_snooze_sets_status_snoozed(self, client, db_session):
        task = seed_task(db_session)
        r = client.post(f"/tasks/{task.id}/snooze", json={"minutes": 60})
        assert r.status_code == 200
        assert r.json()["status"] == "snoozed"

    def test_snooze_sets_snoozed_until(self, client, db_session):
        task = seed_task(db_session)
        r = client.post(f"/tasks/{task.id}/snooze", json={"minutes": 60})
        assert r.json()["snoozed_until"] is not None

    def test_snooze_not_found_returns_404(self, client):
        r = client.post("/tasks/99999/snooze", json={"minutes": 30})
        assert r.status_code == 404

    def test_snooze_done_task_returns_409(self, client, db_session):
        task = seed_task(db_session, status=TaskStatus.done)
        r = client.post(f"/tasks/{task.id}/snooze", json={"minutes": 30})
        assert r.status_code == 409

    def test_snooze_zero_minutes_returns_422(self, client, db_session):
        task = seed_task(db_session)
        r = client.post(f"/tasks/{task.id}/snooze", json={"minutes": 0})
        assert r.status_code == 422

    def test_snooze_too_many_minutes_returns_422(self, client, db_session):
        """Max snooze is 14400 minutes (10 days)."""
        task = seed_task(db_session)
        r = client.post(f"/tasks/{task.id}/snooze", json={"minutes": 99999})
        assert r.status_code == 422

    def test_snooze_already_snoozed_task_updates(self, client, db_session):
        """Re-snoozing a snoozed task should succeed (not 409)."""
        task = seed_task(db_session, status=TaskStatus.snoozed)
        r = client.post(f"/tasks/{task.id}/snooze", json={"minutes": 30})
        assert r.status_code == 200
        assert r.json()["status"] == "snoozed"

    def test_snooze_response_has_task_fields(self, client, db_session):
        task = seed_task(db_session)
        body = client.post(f"/tasks/{task.id}/snooze", json={"minutes": 60}).json()
        assert {"id", "title", "status", "priority", "snoozed_until"}.issubset(body.keys())
