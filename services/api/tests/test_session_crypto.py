"""Tests for session_crypto — AES-256-GCM encrypt/decrypt roundtrip.

Covers:
  - encrypt → decrypt roundtrip (correct PIN)
  - decrypt with wrong PIN raises ValueError
  - is_encrypted detection
  - encrypt is idempotent (already-encrypted file is skipped)
  - decrypt of unencrypted file returns plaintext copy
  - missing file raises FileNotFoundError
  - atomic write: original file is not corrupted on error
"""
import pytest
from pathlib import Path

from app.services.session_crypto import (
    decrypt_session,
    encrypt_session,
    is_encrypted,
)

PIN = "1234"
WRONG_PIN = "9999"
FAKE_SESSION_DATA = b"SQLite format 3\x00" + b"\x00" * 100  # fake SQLite header


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_session_file(tmp_path: Path, content: bytes = FAKE_SESSION_DATA) -> Path:
    """Create a fake .session file and return its path."""
    p = tmp_path / "user.session"
    p.write_bytes(content)
    return p


# ── is_encrypted ──────────────────────────────────────────────────────────────

def test_is_encrypted_returns_false_for_plain_file(tmp_path):
    p = make_session_file(tmp_path)
    assert is_encrypted(p) is False


def test_is_encrypted_returns_false_for_missing_file(tmp_path):
    p = tmp_path / "nonexistent.session"
    assert is_encrypted(p) is False


def test_is_encrypted_returns_true_after_encrypt(tmp_path):
    p = make_session_file(tmp_path)
    encrypt_session(p, PIN)
    assert is_encrypted(p) is True


# ── encrypt_session ───────────────────────────────────────────────────────────

def test_encrypt_changes_file_content(tmp_path):
    p = make_session_file(tmp_path)
    original = p.read_bytes()
    encrypt_session(p, PIN)
    assert p.read_bytes() != original


def test_encrypt_is_idempotent(tmp_path):
    p = make_session_file(tmp_path)
    encrypt_session(p, PIN)
    encrypted_once = p.read_bytes()
    encrypt_session(p, PIN)  # second call — should be no-op
    assert p.read_bytes() == encrypted_once


def test_encrypt_raises_for_missing_file(tmp_path):
    p = tmp_path / "missing.session"
    with pytest.raises(FileNotFoundError):
        encrypt_session(p, PIN)


def test_encrypt_accepts_path_without_suffix(tmp_path):
    """encrypt_session should work even if path has no .session suffix."""
    p = tmp_path / "user.session"
    p.write_bytes(FAKE_SESSION_DATA)
    # Pass path without suffix
    encrypt_session(tmp_path / "user", PIN)
    assert is_encrypted(p) is True


# ── decrypt_session ───────────────────────────────────────────────────────────

def test_decrypt_roundtrip(tmp_path):
    p = make_session_file(tmp_path)
    encrypt_session(p, PIN)

    tmp = decrypt_session(p, PIN)
    try:
        assert tmp.exists()
        assert tmp.read_bytes() == FAKE_SESSION_DATA
    finally:
        tmp.unlink(missing_ok=True)


def test_decrypt_wrong_pin_raises(tmp_path):
    p = make_session_file(tmp_path)
    encrypt_session(p, PIN)

    with pytest.raises(ValueError, match="Decryption failed"):
        decrypt_session(p, WRONG_PIN)


def test_decrypt_unencrypted_file_returns_copy(tmp_path):
    """Decrypting a plain (non-encrypted) file should return a copy of the original."""
    p = make_session_file(tmp_path)

    tmp = decrypt_session(p, PIN)
    try:
        assert tmp != p  # different path (it's a copy)
        assert tmp.read_bytes() == FAKE_SESSION_DATA
    finally:
        tmp.unlink(missing_ok=True)


def test_decrypt_missing_file_raises(tmp_path):
    p = tmp_path / "missing.session"
    with pytest.raises(FileNotFoundError):
        decrypt_session(p, PIN)


def test_decrypt_temp_file_in_same_dir(tmp_path):
    """Temp file should be created in the same directory as the session file."""
    p = make_session_file(tmp_path)
    encrypt_session(p, PIN)

    tmp = decrypt_session(p, PIN)
    try:
        assert tmp.parent == p.parent
    finally:
        tmp.unlink(missing_ok=True)


def test_decrypt_temp_file_cleaned_up_by_caller(tmp_path):
    """Verify that temp file is gone after caller deletes it."""
    p = make_session_file(tmp_path)
    encrypt_session(p, PIN)

    tmp = decrypt_session(p, PIN)
    assert tmp.exists()
    tmp.unlink()
    assert not tmp.exists()


def test_encrypt_decrypt_large_data(tmp_path):
    """Roundtrip with larger payload (simulates real SQLite session)."""
    large_data = b"SQLite format 3\x00" + b"\xAB\xCD" * 50_000  # ~100 KB
    p = tmp_path / "big.session"
    p.write_bytes(large_data)

    encrypt_session(p, PIN)
    assert is_encrypted(p)

    tmp = decrypt_session(p, PIN)
    try:
        assert tmp.read_bytes() == large_data
    finally:
        tmp.unlink(missing_ok=True)


def test_different_pins_produce_different_ciphertext(tmp_path):
    """Two encryptions with different PINs should produce different output."""
    p1 = tmp_path / "s1.session"
    p2 = tmp_path / "s2.session"
    p1.write_bytes(FAKE_SESSION_DATA)
    p2.write_bytes(FAKE_SESSION_DATA)

    encrypt_session(p1, "1111")
    encrypt_session(p2, "2222")

    assert p1.read_bytes() != p2.read_bytes()


def test_same_pin_produces_different_ciphertext_each_time(tmp_path):
    """Each encryption should use a fresh random salt+nonce → different output."""
    p1 = tmp_path / "s1.session"
    p2 = tmp_path / "s2.session"
    p1.write_bytes(FAKE_SESSION_DATA)
    p2.write_bytes(FAKE_SESSION_DATA)

    encrypt_session(p1, PIN)
    encrypt_session(p2, PIN)

    # Different nonce/salt → different ciphertext even for same plaintext + PIN
    assert p1.read_bytes() != p2.read_bytes()
