"""Windows DPAPI encryption for sensitive .env credentials.

Encrypts TG_API_ID and TG_API_HASH (the Telegram app credentials) using the
Windows Data Protection API (DPAPI).  The encrypted blob is tied to the
current Windows user account and machine — it cannot be decrypted by any
other user or on any other machine.

File format:
    AppData/.../secrets.dpapi  — JSON dict encrypted with CryptProtectData

Plaintext .env still exists for non-sensitive settings (session name, chat
IDs, phone number, etc.).  Sensitive keys are removed from .env after
migration and loaded from DPAPI at startup.

Backward compatibility:
    - If DPAPI is unavailable (non-Windows, CI, unit tests) the service is a
      transparent no-op: all reads return {}, all writes are silently skipped.
    - If secrets.dpapi does not exist, settings fall back to .env normally.

Usage:
    # Encrypt and save secrets:
    save_secrets({"TG_API_ID": "123", "TG_API_HASH": "abc"})

    # Load at startup — injects into os.environ so pydantic-settings picks up:
    inject_secrets_into_env()

    # Migrate specific keys out of .env into DPAPI:
    migrate_keys_from_env(env_path, ["TG_API_ID", "TG_API_HASH"])

    # Check what is already stored:
    load_secrets()  → {"TG_API_ID": "123", "TG_API_HASH": "abc"}
"""
import ctypes
import ctypes.wintypes as wintypes
import json
import logging
import os
from pathlib import Path
from typing import Any

from ..path_utils import get_data_dir

logger = logging.getLogger(__name__)

_DPAPI_FILE = "secrets.dpapi"
_DESCRIPTION = "tg-focus-filter"

# Fields considered sensitive — to be migrated out of .env
SENSITIVE_ENV_KEYS = ("TG_API_ID", "TG_API_HASH")


# ── DPAPI availability ────────────────────────────────────────────────────────

def is_dpapi_available() -> bool:
    """Return True if Windows DPAPI is accessible (i.e. running on Windows)."""
    return os.name == "nt"


# ── Low-level DPAPI (ctypes, no extra dependencies) ───────────────────────────

class _DATA_BLOB(ctypes.Structure):
    """Windows CRYPT_DATA_BLOB / DATA_BLOB structure."""
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def _protect(plaintext: bytes) -> bytes:
    """Encrypt bytes with CryptProtectData (current-user scope)."""
    crypt32 = ctypes.windll.crypt32  # type: ignore[attr-defined]
    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

    buf = ctypes.create_string_buffer(plaintext)
    blob_in = _DATA_BLOB(len(plaintext), buf)
    blob_out = _DATA_BLOB()

    ok = crypt32.CryptProtectData(
        ctypes.byref(blob_in),
        _DESCRIPTION,   # optional description (unicode)
        None,           # optional entropy — None
        None,           # reserved
        None,           # prompt struct — None (no UI)
        0,              # flags
        ctypes.byref(blob_out),
    )
    if not ok:
        raise OSError(f"CryptProtectData failed: {ctypes.GetLastError()}")

    result = ctypes.string_at(blob_out.pbData, blob_out.cbData)
    kernel32.LocalFree(blob_out.pbData)
    return result


def _unprotect(ciphertext: bytes) -> bytes:
    """Decrypt bytes with CryptUnprotectData (current-user scope)."""
    crypt32 = ctypes.windll.crypt32  # type: ignore[attr-defined]
    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

    buf = ctypes.create_string_buffer(ciphertext)
    blob_in = _DATA_BLOB(len(ciphertext), buf)
    blob_out = _DATA_BLOB()

    ok = crypt32.CryptUnprotectData(
        ctypes.byref(blob_in),
        None,           # pp description out — not needed
        None,           # optional entropy — None
        None,           # reserved
        None,           # prompt struct — None (no UI)
        0,              # flags
        ctypes.byref(blob_out),
    )
    if not ok:
        raise OSError(f"CryptUnprotectData failed: {ctypes.GetLastError()}")

    result = ctypes.string_at(blob_out.pbData, blob_out.cbData)
    kernel32.LocalFree(blob_out.pbData)
    return result


# ── High-level API ────────────────────────────────────────────────────────────

def _dpapi_path() -> Path:
    from ..path_utils import get_data_dir
    return get_data_dir() / _DPAPI_FILE


def save_secrets(data: dict[str, Any]) -> bool:
    """Encrypt and persist a dict of secrets to secrets.dpapi.

    Merges with existing secrets (update semantics — existing keys not in
    `data` are preserved).

    Returns True on success, False if DPAPI is unavailable or failed.
    """
    if not is_dpapi_available():
        logger.debug("DPAPI unavailable — skipping save_secrets")
        return False

    try:
        # Merge with existing
        existing = load_secrets()
        existing.update(data)

        plaintext = json.dumps(existing, ensure_ascii=False).encode("utf-8")
        ciphertext = _protect(plaintext)

        path = _dpapi_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(ciphertext)

        logger.info("Secrets saved to DPAPI: %s", list(data.keys()))
        return True

    except Exception as exc:
        logger.warning("DPAPI save_secrets failed: %s", exc)
        return False


def load_secrets() -> dict[str, Any]:
    """Decrypt and return secrets from secrets.dpapi.

    Returns empty dict if file missing, DPAPI unavailable, or decryption fails.
    """
    if not is_dpapi_available():
        return {}

    path = _dpapi_path()
    if not path.exists():
        return {}

    try:
        ciphertext = path.read_bytes()
        plaintext = _unprotect(ciphertext)
        return json.loads(plaintext.decode("utf-8"))
    except Exception as exc:
        logger.warning("DPAPI load_secrets failed: %s", exc)
        return {}


def inject_secrets_into_env() -> None:
    """Load DPAPI secrets and inject them into os.environ.

    Called once inside get_settings() before Settings() is constructed so
    that pydantic-settings picks them up from the environment (env vars take
    priority over .env file values).

    Idempotent and non-fatal.
    """
    secrets = load_secrets()
    if not secrets:
        return

    for key, value in secrets.items():
        os.environ.setdefault(key, str(value))

    logger.debug("DPAPI secrets injected into env: %s", list(secrets.keys()))


def migrate_keys_from_env(env_path: Path, keys: tuple[str, ...] = SENSITIVE_ENV_KEYS) -> bool:
    """Move sensitive keys from .env into DPAPI, removing them from .env.

    Returns True if at least one key was migrated, False otherwise.
    Idempotent: keys already in DPAPI are skipped.
    """
    if not is_dpapi_available():
        return False

    from dotenv import dotenv_values, unset_key

    try:
        env_values = dotenv_values(str(env_path))
        to_migrate: dict[str, str] = {}

        for key in keys:
            raw = env_values.get(key)
            value = raw.strip() if raw else ""
            if value:
                to_migrate[key] = value

        if not to_migrate:
            logger.debug("DPAPI migration: no sensitive keys found in .env")
            return False

        # Save to DPAPI first — only remove from .env after successful save
        if not save_secrets(to_migrate):
            logger.warning("DPAPI migration aborted — save_secrets failed")
            return False

        # Remove from .env (leave empty key removed, not just blank)
        for key in to_migrate:
            unset_key(str(env_path), key)

        logger.info(
            "DPAPI migration: moved %s from .env to secrets.dpapi",
            list(to_migrate.keys()),
        )
        return True

    except Exception as exc:
        logger.warning("DPAPI migration failed: %s", exc)
        return False


def has_secrets() -> bool:
    """Return True if secrets.dpapi exists and is non-empty."""
    secrets = load_secrets()
    return bool(secrets)
