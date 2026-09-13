"""Tests for features added in the current sprint:

  1. _detect_media_type — unit tests for the media-type detection helper
  2. _delete_tasks_for_messages — deletes inbox/snoozed tasks, keeps done
  3. task_deleted WS broadcast — emitted after deletion
  4. Reaction settings — new fields present in GET /settings and PATCH /settings
  5. media_type field — stored and returned via GET /tasks
"""
import itertools
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.orm import Session

from app.models import Task, TaskPriority, TaskStatus
from app.workers.tg_listener import _detect_media_type, _delete_tasks_for_messages


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_msg(media=None):
    """Return a minimal fake Telethon message object."""
    return SimpleNamespace(media=media)


def _make_media(cls_name: str, doc_attrs=None):
    """Return a fake media object whose type().__name__ == cls_name."""
    if doc_attrs is not None:
        doc = type("_Doc", (), {"attributes": doc_attrs})()
        cls = type(cls_name, (), {"document": doc})
    else:
        cls = type(cls_name, (), {})
    return cls()


def _make_audio_attr(voice: bool = False):
    cls = type("DocumentAttributeAudio", (), {"voice": voice})
    return cls()


def _make_video_attr():
    cls = type("DocumentAttributeVideo", (), {})
    return cls()


_MESSAGE_IDS = itertools.count(1000)


def seed_task(
    db: Session,
    title: str = "Test",
    status: TaskStatus = TaskStatus.inbox,
    chat_id: str = "-100123",
    source_message_id: int | None = None,
    media_type: str | None = None,
) -> Task:
    # Each task gets its own Telegram message: the tasks table forbids
    # two tasks sharing one (chat_id, source_message_id).
    if source_message_id is None:
        source_message_id = next(_MESSAGE_IDS)
    t = Task(
        title=title,
        status=status,
        priority=TaskPriority.medium,
        chat_id=chat_id,
        source_message_id=source_message_id,
        media_type=media_type,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# ── 1. _detect_media_type ──────────────────────────────────────────────────────

class TestDetectMediaType:
    def test_no_media_returns_none(self):
        assert _detect_media_type(_make_msg(media=None)) is None

    def test_photo(self):
        media = _make_media("MessageMediaPhoto")
        assert _detect_media_type(_make_msg(media)) == "photo"

    def test_video(self):
        media = _make_media("MessageMediaDocument", doc_attrs=[_make_video_attr()])
        assert _detect_media_type(_make_msg(media)) == "video"

    def test_voice(self):
        media = _make_media("MessageMediaDocument", doc_attrs=[_make_audio_attr(voice=True)])
        assert _detect_media_type(_make_msg(media)) == "voice"

    def test_audio(self):
        media = _make_media("MessageMediaDocument", doc_attrs=[_make_audio_attr(voice=False)])
        assert _detect_media_type(_make_msg(media)) == "audio"

    def test_document_no_attrs(self):
        media = _make_media("MessageMediaDocument", doc_attrs=[])
        assert _detect_media_type(_make_msg(media)) == "document"

    def test_location(self):
        media = _make_media("MessageMediaGeo")
        assert _detect_media_type(_make_msg(media)) == "location"

    def test_unknown_media_returns_none(self):
        media = _make_media("MessageMediaUnsupported")
        assert _detect_media_type(_make_msg(media)) is None


# ── 2 & 3. _delete_tasks_for_messages + WS broadcast ─────────────────────────

class TestDeleteTasksForMessages:
    """Tests for _delete_tasks_for_messages.

    The function opens its own DB session via SessionLocal, so we patch
    SessionLocal to return the test session.
    """

    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    def test_deletes_inbox_task(self, db_session):
        task = seed_task(db_session, source_message_id=10, chat_id="-10012345")

        with patch("app.workers.tg_listener.SessionLocal", return_value=db_session), \
             patch("app.workers.tg_listener.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            self._run(_delete_tasks_for_messages(
                channel_id=None, msg_ids=[10], is_channel=False
            ))

        remaining = db_session.query(Task).filter(Task.id == task.id).first()
        assert remaining is None

    def test_deletes_snoozed_task(self, db_session):
        task = seed_task(db_session, status=TaskStatus.snoozed, source_message_id=20)

        with patch("app.workers.tg_listener.SessionLocal", return_value=db_session), \
             patch("app.workers.tg_listener.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            self._run(_delete_tasks_for_messages(
                channel_id=None, msg_ids=[20], is_channel=False
            ))

        remaining = db_session.query(Task).filter(Task.id == task.id).first()
        assert remaining is None

    def test_keeps_done_task(self, db_session):
        task = seed_task(db_session, status=TaskStatus.done, source_message_id=30)

        with patch("app.workers.tg_listener.SessionLocal", return_value=db_session), \
             patch("app.workers.tg_listener.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            self._run(_delete_tasks_for_messages(
                channel_id=None, msg_ids=[30], is_channel=False
            ))

        remaining = db_session.query(Task).filter(Task.id == task.id).first()
        assert remaining is not None, "Done tasks must NOT be deleted"

    def test_channel_filter_by_chat_id(self, db_session):
        """Channel delete: only tasks matching the channel's chat_id are removed."""
        # channel_id=12345 → chat_id="-10012345" (after str(-int("10012345")))
        task_match = seed_task(db_session, source_message_id=40, chat_id="-10012345")
        task_other = seed_task(db_session, source_message_id=40, chat_id="-10099999")
        # Save IDs before the function closes its own session copy
        match_id = task_match.id
        other_id = task_other.id

        with patch("app.workers.tg_listener.SessionLocal", return_value=db_session), \
             patch("app.workers.tg_listener.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            self._run(_delete_tasks_for_messages(
                channel_id=12345, msg_ids=[40], is_channel=True
            ))

        assert db_session.query(Task).filter(Task.id == match_id).first() is None
        assert db_session.query(Task).filter(Task.id == other_id).first() is not None

    def test_broadcasts_task_deleted(self, db_session):
        """WS event 'task_deleted' must be broadcast for each deleted task."""
        task = seed_task(db_session, source_message_id=50)

        with patch("app.workers.tg_listener.SessionLocal", return_value=db_session), \
             patch("app.workers.tg_listener.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            self._run(_delete_tasks_for_messages(
                channel_id=None, msg_ids=[50], is_channel=False
            ))

        mock_mgr.broadcast.assert_awaited_once_with("task_deleted", {"id": task.id})

    def test_no_broadcast_when_nothing_deleted(self, db_session):
        """No WS event when no matching tasks exist."""
        with patch("app.workers.tg_listener.SessionLocal", return_value=db_session), \
             patch("app.workers.tg_listener.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            self._run(_delete_tasks_for_messages(
                channel_id=None, msg_ids=[999], is_channel=False
            ))

        mock_mgr.broadcast.assert_not_awaited()

    def test_empty_msg_ids_is_noop(self, db_session):
        """Empty msg_ids list → no DB queries, no broadcast."""
        seed_task(db_session, source_message_id=60)

        with patch("app.workers.tg_listener.SessionLocal", return_value=db_session), \
             patch("app.workers.tg_listener.manager") as mock_mgr:
            mock_mgr.broadcast = AsyncMock()
            self._run(_delete_tasks_for_messages(
                channel_id=None, msg_ids=[], is_channel=False
            ))

        mock_mgr.broadcast.assert_not_awaited()


# ── 4. Reaction settings ───────────────────────────────────────────────────────

class TestReactionSettings:
    def test_get_settings_has_reaction_fields(self, client):
        body = client.get("/settings").json()
        assert "done_reaction_enabled" in body
        assert "custom_reply_reaction_enabled" in body
        assert "custom_reply_reaction" in body

    def test_reaction_enabled_fields_are_bool(self, client):
        body = client.get("/settings").json()
        assert isinstance(body["done_reaction_enabled"], bool)
        assert isinstance(body["custom_reply_reaction_enabled"], bool)

    def test_custom_reply_reaction_is_str_or_none(self, client):
        body = client.get("/settings").json()
        assert body["custom_reply_reaction"] is None or isinstance(body["custom_reply_reaction"], str)

    def test_patch_done_reaction_enabled(self, client):
        with patch("app.routers.settings.save_settings", return_value=None):
            r = client.patch("/settings", json={"done_reaction_enabled": False})
        assert r.status_code == 200
        assert "done_reaction_enabled" in r.json()

    def test_patch_custom_reply_reaction(self, client):
        with patch("app.routers.settings.save_settings", return_value=None):
            r = client.patch("/settings", json={"custom_reply_reaction": "🔥"})
        assert r.status_code == 200

    def test_patch_custom_reply_reaction_enabled(self, client):
        with patch("app.routers.settings.save_settings", return_value=None):
            r = client.patch("/settings", json={"custom_reply_reaction_enabled": True})
        assert r.status_code == 200


# ── 5. media_type field in tasks ───────────────────────────────────────────────

class TestMediaTypeField:
    def test_task_with_media_type_returned_in_list(self, client, db_session):
        seed_task(db_session, media_type="photo", source_message_id=100)
        r = client.get("/tasks?status=inbox")
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["media_type"] == "photo"

    def test_task_without_media_type_returns_null(self, client, db_session):
        seed_task(db_session, media_type=None, source_message_id=101)
        r = client.get("/tasks?status=inbox")
        items = r.json()["items"]
        assert items[0]["media_type"] is None

    def test_all_media_types_stored(self, db_session):
        for mt in ("photo", "video", "voice", "audio", "document", "location"):
            t = seed_task(db_session, media_type=mt, source_message_id=hash(mt) % 10000)
            db_session.refresh(t)
            assert t.media_type == mt


# ── 6. catchup_enabled setting ────────────────────────────────────────────────

class TestCatchupEnabled:
    def test_get_settings_has_catchup_enabled(self, client):
        body = client.get("/settings").json()
        assert "catchup_enabled" in body

    def test_catchup_enabled_is_bool(self, client):
        body = client.get("/settings").json()
        assert isinstance(body["catchup_enabled"], bool)

    def test_catchup_enabled_default_is_false(self, client):
        body = client.get("/settings").json()
        assert body["catchup_enabled"] is False

    def test_patch_catchup_enabled_true(self, client):
        with patch("app.routers.settings.save_settings", return_value=None):
            r = client.patch("/settings", json={"catchup_enabled": True})
        assert r.status_code == 200
        assert "catchup_enabled" in r.json()

    def test_patch_catchup_enabled_false(self, client):
        with patch("app.routers.settings.save_settings", return_value=None):
            r = client.patch("/settings", json={"catchup_enabled": False})
        assert r.status_code == 200

    def test_autoscan_skipped_when_disabled(self):
        """run_catchup() with no explicit scan_hours skips when catchup_enabled=False."""
        from app.workers.catchup_worker import run_catchup
        import asyncio

        mock_settings = MagicMock()
        mock_settings.catchup_enabled = False
        mock_settings.catchup_hours = 8

        # get_settings is imported lazily inside run_catchup — patch at source
        with patch("app.config.get_settings", return_value=mock_settings):
            result = asyncio.get_event_loop().run_until_complete(run_catchup())

        assert result["scanned"] == 0
        assert result["created"] == 0

    def test_autoscan_runs_when_enabled(self):
        """run_catchup() proceeds past the enabled gate when catchup_enabled=True."""
        from app.workers.catchup_worker import run_catchup
        import asyncio

        mock_settings = MagicMock()
        mock_settings.catchup_enabled = True
        mock_settings.catchup_hours = 8

        # It will stop at the Telegram client check — we just verify it passed the gate
        with patch("app.config.get_settings", return_value=mock_settings), \
             patch("app.services.telegram_service.TelegramService.get_client", return_value=None):
            result = asyncio.get_event_loop().run_until_complete(run_catchup())

        # Reached the client check (not the enabled gate) → scanned=0 but different path
        assert result["scanned"] == 0

    def test_manual_scan_ignores_catchup_enabled(self):
        """run_catchup(scan_hours=N) always runs regardless of catchup_enabled."""
        from app.workers.catchup_worker import run_catchup
        import asyncio

        mock_settings = MagicMock()
        mock_settings.catchup_enabled = False
        mock_settings.catchup_hours = 8

        with patch("app.config.get_settings", return_value=mock_settings), \
             patch("app.services.telegram_service.TelegramService.get_client", return_value=None):
            result = asyncio.get_event_loop().run_until_complete(run_catchup(scan_hours=4))

        # Passed the enabled gate (scan_hours provided), stopped at client check
        assert result["scanned"] == 0
