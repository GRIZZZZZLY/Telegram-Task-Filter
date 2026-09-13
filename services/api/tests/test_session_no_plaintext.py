"""An encrypted session must never leave a plaintext copy on disk.

Before the in-memory switch, every start decrypted the session to a file that
Telethon held open; deletion was deferred to stop() and never ran on a hard
exit, so plaintext copies of the Telegram auth key accumulated (106 files were
found on the author's machine).
"""
import os
from unittest.mock import patch

import pytest
from telethon.crypto import AuthKey
from telethon.sessions import SQLiteSession, StringSession

from app.services.session_crypto import encrypt_session
from app.services.telegram_service import TelegramService


@pytest.fixture
def session_file(tmp_path):
    """A real, authorized-looking SQLite session at <tmp>/user.session."""
    sess = SQLiteSession(str(tmp_path / "user"))
    sess.set_dc(2, "149.154.167.51", 443)
    sess.auth_key = AuthKey(os.urandom(256))
    sess.save()
    sess.close()
    return tmp_path / "user.session"


def _pin(is_set: bool, current: str | None):
    return (
        patch("app.services.pin_service.is_pin_set", return_value=is_set),
        patch("app.services.pin_service.get_current_pin", return_value=current),
    )


def test_encrypted_session_leaves_no_plaintext_copy(session_file):
    encrypt_session(session_file, "1234")
    set_patch, pin_patch = _pin(True, "1234")

    with set_patch, pin_patch:
        session = TelegramService._load_session(session_file)

    assert isinstance(session, StringSession)
    assert session.auth_key is not None
    assert list(session_file.parent.glob("_tgff_dec_*")) == []


def test_locked_session_is_not_decrypted(session_file):
    encrypt_session(session_file, "1234")
    set_patch, pin_patch = _pin(True, None)

    with set_patch, pin_patch:
        assert TelegramService._load_session(session_file) is None

    assert list(session_file.parent.glob("_tgff_dec_*")) == []


def test_wrong_pin_leaves_no_plaintext_copy(session_file):
    encrypt_session(session_file, "1234")
    set_patch, pin_patch = _pin(True, "9999")

    with set_patch, pin_patch:
        assert TelegramService._load_session(session_file) is None

    assert list(session_file.parent.glob("_tgff_dec_*")) == []


def test_plaintext_session_is_used_in_place(session_file):
    """Without a PIN, Telethon keeps the file so session updates persist."""
    set_patch, pin_patch = _pin(False, None)

    with set_patch, pin_patch:
        session = TelegramService._load_session(session_file)

    assert session == str(session_file.with_suffix(""))


def test_purge_removes_copies_left_by_older_versions(tmp_path):
    leftovers = [tmp_path / f"_tgff_dec_{i}.session" for i in range(3)]
    for f in leftovers:
        f.write_bytes(b"plaintext session")
    keep = tmp_path / "user.session"
    keep.write_bytes(b"the real session")

    TelegramService._purge_stale_temp_sessions(tmp_path)

    assert not any(f.exists() for f in leftovers)
    assert keep.exists()
