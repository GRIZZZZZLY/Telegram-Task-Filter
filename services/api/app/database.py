"""SQLAlchemy engine, session factory, and table bootstrap."""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings


def _make_engine():
    settings = get_settings()
    # Ensure data directory exists (SQLite needs the parent dir)
    db_path = settings.db_url.replace("sqlite:///", "")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        settings.db_url,
        connect_args={"check_same_thread": False},
        # echo=True floods logs every second from commit_worker — disabled.
        # SQL debug: set APP_LOG_LEVEL=DEBUG in .env temporarily.
        echo=False,
    )


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    """FastAPI dependency — yields a DB session per request."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    """Bootstrap schema on startup.

    MVP: create_all is sufficient for single-user SQLite.
    TODO (stage 2): replace with Alembic migrations.
    """
    from .models import Base  # local import avoids circular dependency

    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations() -> None:
    """Apply lightweight schema migrations for existing databases.

    SQLite doesn't support DROP/ALTER column — only ADD COLUMN.
    New columns are added here when upgrading from earlier versions.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing = {col["name"] for col in inspector.get_columns("tasks")}

    with engine.begin() as conn:
        if "snoozed_until" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN snoozed_until DATETIME"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.snoozed_until")
        if "sort_order" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN sort_order INTEGER"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.sort_order")
        if "custom_reply" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN custom_reply VARCHAR(500)"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.custom_reply")
        if "sender_id" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN sender_id VARCHAR(100)"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.sender_id")
        if "sender_username" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN sender_username VARCHAR(100)"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.sender_username")
        if "trigger_message_id" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN trigger_message_id INTEGER"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.trigger_message_id")
        if "in_progress" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN in_progress BOOLEAN NOT NULL DEFAULT 0"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.in_progress")
        if "work_started_at" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN work_started_at DATETIME"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.work_started_at")
        if "source_changed" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN source_changed BOOLEAN NOT NULL DEFAULT 0"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.source_changed")
        if "source_edited_at" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN source_edited_at DATETIME"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.source_edited_at")
        if "sender_first_name" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN sender_first_name VARCHAR(200)"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.sender_first_name")
        if "peer_reactions" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN peer_reactions TEXT"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.peer_reactions")
        if "media_type" not in existing:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN media_type VARCHAR(20)"))
            import logging
            logging.getLogger(__name__).info("Migration: added tasks.media_type")
