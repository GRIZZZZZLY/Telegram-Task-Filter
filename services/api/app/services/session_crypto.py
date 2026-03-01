"""Session file encryption/decryption using AES-256-GCM.

Security model:
  - Key derivation: PBKDF2-HMAC-SHA256(pin, salt, iterations=600_000) → 32 bytes
  - Encryption: AES-256-GCM with random 12-byte nonce
  - Encrypted file format (binary):
      [4 bytes: magic "TGFF"] [1 byte: version=1]
      [16 bytes: salt] [12 bytes: nonce] [N bytes: ciphertext+tag]
  - Unencrypted files are detected by absence of magic header — safe to pass through.

Usage:
    # Encrypt a session file in-place:
    encrypt_session(path, pin)

    # Decrypt to a temp file, use it, then clean up:
    tmp = decrypt_session(path, pin)
    try:
        # use tmp ...
    finally:
        tmp.unlink(missing_ok=True)

    # Check if a file is encrypted:
    is_encrypted(path)  → bool
"""
import logging
import os
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# File format constants
_MAGIC = b"TGFF"
_VERSION = b"\x01"
_HEADER_SIZE = 4 + 1 + 16 + 12  # magic + version + salt + nonce = 33 bytes
_SALT_SIZE = 16
_NONCE_SIZE = 12
_KEY_SIZE = 32  # AES-256
_PBKDF2_ITERATIONS = 600_000


def _derive_key(pin: str, salt: bytes) -> bytes:
    """Derive a 32-byte AES key from PIN + salt using PBKDF2-HMAC-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=_KEY_SIZE,
        salt=salt,
        iterations=_PBKDF2_ITERATIONS,
    )
    return kdf.derive(pin.encode("utf-8"))


def is_encrypted(path: Path) -> bool:
    """Return True if the file starts with the TGFF magic header."""
    try:
        with open(path, "rb") as f:
            header = f.read(len(_MAGIC) + len(_VERSION))
        return header == _MAGIC + _VERSION
    except OSError:
        return False


def encrypt_session(path: Path, pin: str) -> None:
    """Encrypt a session file in-place.

    If the file is already encrypted, this is a no-op (idempotent).

    Args:
        path: Path to the .session file (without .session suffix is also accepted).
        pin:  PIN string (4-6 digits).

    Raises:
        FileNotFoundError: if the session file does not exist.
        ValueError:        if the file is already encrypted.
        OSError:           on read/write failures.
    """
    session_path = _resolve_session_path(path)

    if is_encrypted(session_path):
        logger.debug("Session already encrypted — skipping: %s", session_path)
        return

    plaintext = session_path.read_bytes()

    salt = os.urandom(_SALT_SIZE)
    nonce = os.urandom(_NONCE_SIZE)
    key = _derive_key(pin, salt)

    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)  # no AAD

    encrypted = _MAGIC + _VERSION + salt + nonce + ciphertext

    # Write atomically: write to temp file, then replace
    tmp_path = session_path.with_suffix(".session.tmp")
    try:
        tmp_path.write_bytes(encrypted)
        tmp_path.replace(session_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    logger.info("Session encrypted: %s (%d bytes)", session_path.name, len(encrypted))


def decrypt_session(path: Path, pin: str) -> Path:
    """Decrypt an encrypted session file to a temporary file.

    If the file is NOT encrypted (plain SQLite), returns a copy in a temp
    location so the caller always gets a usable path without modifying the
    original.

    Args:
        path: Path to the (possibly encrypted) .session file.
        pin:  PIN string.

    Returns:
        Path to a temporary plaintext .session file.
        Caller is responsible for deleting it after use.

    Raises:
        FileNotFoundError: if the session file does not exist.
        ValueError:        on decryption failure (wrong PIN or corrupted file).
        OSError:           on read/write failures.
    """
    session_path = _resolve_session_path(path)

    if not session_path.exists():
        raise FileNotFoundError(f"Session file not found: {session_path}")

    data = session_path.read_bytes()

    # Create temp file in the same directory (same filesystem → atomic rename later)
    tmp_fd, tmp_str = tempfile.mkstemp(
        suffix=".session",
        prefix="_tgff_dec_",
        dir=session_path.parent,
    )
    tmp_path = Path(tmp_str)

    try:
        if not data[:len(_MAGIC) + len(_VERSION)] == _MAGIC + _VERSION:
            # Not encrypted — write plaintext copy
            os.write(tmp_fd, data)
            os.close(tmp_fd)
            logger.debug("Session is not encrypted — using plaintext copy: %s", tmp_path.name)
            return tmp_path

        # Parse header
        offset = len(_MAGIC) + len(_VERSION)
        salt = data[offset: offset + _SALT_SIZE]
        offset += _SALT_SIZE
        nonce = data[offset: offset + _NONCE_SIZE]
        offset += _NONCE_SIZE
        ciphertext = data[offset:]

        key = _derive_key(pin, salt)
        aesgcm = AESGCM(key)

        try:
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        except Exception as exc:
            raise ValueError("Decryption failed — wrong PIN or corrupted session file") from exc

        os.write(tmp_fd, plaintext)
        os.close(tmp_fd)

        logger.info("Session decrypted to temp file: %s", tmp_path.name)
        return tmp_path

    except Exception:
        try:
            os.close(tmp_fd)
        except OSError:
            pass
        tmp_path.unlink(missing_ok=True)
        raise


def _resolve_session_path(path: Path) -> Path:
    """Ensure path ends with .session suffix."""
    if path.suffix != ".session":
        return path.with_suffix(".session")
    return path
