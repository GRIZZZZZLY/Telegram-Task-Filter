"""Shared test fixtures.

Uses in-memory SQLite via StaticPool so every test run is:
  - fast  (no disk I/O)
  - isolated  (autouse fixture drops + recreates all tables per test)
  - clean  (no leftover *.db files)
"""
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Base

_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # single connection reused — required for :memory:
)
_Session = sessionmaker(bind=_ENGINE, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def reset_db():
    """Drop and recreate all tables before each test for full isolation."""
    Base.metadata.drop_all(bind=_ENGINE)
    Base.metadata.create_all(bind=_ENGINE)
    yield
    # Tables will be dropped at the start of the next test


@pytest.fixture
def db_session(reset_db):
    """Yield a fresh DB session. Closed after the test."""
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def mock_telegram_service():
    """Isolate all tests from real Telegram — TelegramService acts as disconnected stub.

    This ensures tests are deterministic regardless of whether a real session
    exists on the machine running the tests.
    """
    with patch(
        "app.services.telegram_service.TelegramService.start",
        new_callable=AsyncMock,
    ), patch(
        "app.services.telegram_service.TelegramService.stop",
        new_callable=AsyncMock,
    ), patch(
        "app.services.telegram_service.TelegramService.is_available",
        return_value=False,
    ), patch(
        "app.services.telegram_service.TelegramService.send_done",
        new_callable=AsyncMock,
        return_value={"reply_message_id": None},
    ), patch(
        "app.services.telegram_service.TelegramService.remove_done",
        new_callable=AsyncMock,
        return_value={"reaction_removed": False, "reply_deleted": False},
    ):
        yield


@pytest.fixture(autouse=True)
def isolate_pin_service(tmp_path):
    """Ensure PIN service uses a temp directory so tests don't read/write real pin.json.

    Without this, the PinAuthMiddleware would check the real user data dir
    and potentially block test requests if a PIN was set on the dev machine.
    """
    import app.services.pin_service as ps
    with patch("app.services.pin_service.get_data_dir", return_value=tmp_path):
        # Reset all in-memory state for full test isolation
        ps._active_tokens.clear()
        ps._failed_attempts = 0
        ps._lockout_until = 0.0
        ps._current_pin = None
        yield tmp_path


@pytest.fixture
def client(db_session):
    """TestClient with DB dependency overridden to use the test session."""

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
