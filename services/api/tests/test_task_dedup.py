"""One Telegram message may produce only one task.

The listener checks for an existing task before inserting, but the check and
the insert are not atomic: two messages handled at once can both pass it and
create a duplicate. A unique index closes that race.
"""
import sqlite3
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.models import Base, Task, TaskStatus


def _task(**kw) -> Task:
    return Task(
        title=kw.pop("title", "Задача"),
        status=TaskStatus.inbox,
        chat_id=kw.pop("chat_id", "-100123"),
        source_message_id=kw.pop("source_message_id", 42),
        **kw,
    )


def test_same_message_cannot_produce_two_tasks(db_session):
    db_session.add(_task())
    db_session.commit()

    db_session.add(_task(title="Тот же источник"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_message_id_in_another_chat_is_allowed(db_session):
    db_session.add(_task(chat_id="-100111"))
    db_session.add(_task(chat_id="-100222"))
    db_session.commit()

    assert db_session.query(Task).count() == 2


def test_tasks_without_a_telegram_source_are_not_constrained(db_session):
    """SQLite treats NULLs as distinct, so sourceless tasks never collide."""
    db_session.add(_task(chat_id=None, source_message_id=None))
    db_session.add(_task(chat_id=None, source_message_id=None))
    db_session.commit()

    assert db_session.query(Task).count() == 2


# ── Migration for databases created before the index existed ────────────────

INDEX = "ix_tasks_chat_source_message"


def _legacy_db(tmp_path, rows):
    """Build a database whose tasks table has no unique index, and seed it."""
    path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text(f"DROP INDEX IF EXISTS {INDEX}"))
        for chat_id, message_id in rows:
            conn.execute(
                text(
                    "INSERT INTO tasks (title, status, priority, chat_id, source_message_id,"
                    " created_at, updated_at, in_progress, source_changed)"
                    " VALUES ('t', 'inbox', 'normal', :c, :m,"
                    " '2026-01-01 00:00:00', '2026-01-01 00:00:00', 0, 0)"
                ),
                {"c": chat_id, "m": message_id},
            )
    return path, engine


def _indexes(path):
    with sqlite3.connect(path) as conn:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}


def test_migration_adds_the_index_to_an_existing_database(tmp_path):
    path, engine = _legacy_db(tmp_path, [("-100123", 1), ("-100123", 2)])
    assert INDEX not in _indexes(path)

    with patch("app.database.engine", engine):
        from app.database import _add_source_message_unique_index

        _add_source_message_unique_index()

    assert INDEX in _indexes(path)


def test_migration_keeps_duplicate_rows_instead_of_deleting_them(tmp_path):
    """A user's tasks are worth more than the constraint: skip, never delete."""
    path, engine = _legacy_db(tmp_path, [("-100123", 7), ("-100123", 7)])

    with patch("app.database.engine", engine):
        from app.database import _add_source_message_unique_index

        _add_source_message_unique_index()

    assert INDEX not in _indexes(path)
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 2
