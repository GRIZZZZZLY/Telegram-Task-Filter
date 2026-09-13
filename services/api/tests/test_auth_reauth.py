"""Re-authentication must not hand Telethon an encrypted session file.

Regression for: POST /auth/start → 400 "file is not a database" when the
existing session was encrypted with the PIN (Telegram had revoked it after
6 months idle, user tried to log in again).
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.routers import auth as auth_mod
from app.services.session_crypto import encrypt_session, is_encrypted


class _FakeClient:
    """Stands in for TelegramClient — never touches the network or the file."""

    async def connect(self) -> None:
        pass

    async def send_code_request(self, phone: str):
        return SimpleNamespace(phone_code_hash="hash")

    async def disconnect(self) -> None:
        pass


@pytest.fixture
def sessions_dir(tmp_path):
    d = tmp_path / "sessions"
    d.mkdir()
    with patch.object(auth_mod, "_SESSIONS_DIR", d):
        yield d
    auth_mod._pending_client = None
    auth_mod._phone_code_hash = None


def test_auth_start_moves_encrypted_session_aside(client, sessions_dir):
    from app.config import get_settings

    session_file = sessions_dir / f"{get_settings().tg_session_name}.session"
    session_file.write_bytes(b"SQLite format 3\x00" + b"\x00" * 64)
    encrypt_session(session_file, "1234")
    assert is_encrypted(session_file)

    with patch.object(auth_mod, "_make_client", return_value=_FakeClient()), \
         patch("app.config.save_tg_credentials"):
        res = client.post(
            "/auth/start",
            json={"api_id": 1, "api_hash": "hash", "phone": "+10000000000"},
        )

    assert res.status_code == 200, res.text
    # Telethon would open this path as SQLite — an encrypted blob must be gone
    assert not session_file.exists() or not is_encrypted(session_file)
    assert (sessions_dir / f"{get_settings().tg_session_name}.session.bak").exists()
