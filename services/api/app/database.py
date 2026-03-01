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
