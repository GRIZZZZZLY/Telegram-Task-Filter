"""PIN-code authentication service.

Manages a 4-6 digit PIN that protects the app from unauthorized local access.
PIN hash is stored in `pin.json` inside the user data directory.
Session tokens are short-lived, in-memory only (never persisted to disk).

Security model:
  - PIN → bcrypt hash → stored in pin.json
  - Successful verify → returns a random session token (hex, 64 chars)
  - Token stored in _active_tokens set (in-memory, lost on restart → re-auth)
  - All API routes (except whitelist) require `Authorization: Bearer <token>`
  - Brute-force protection: 5 failed attempts → 30s lockout
"""
import json
import logging
import secrets
import time
from pathlib import Path

import bcrypt

from ..path_utils import get_data_dir

logger = logging.getLogger(__name__)

_PIN_FILE = "pin.json"

# In-memory token store — tokens are lost on restart (intentional: forces re-auth)
_active_tokens: set[str] = set()

# In-memory PIN cache — stored only after successful verify, used for session decryption.
# Never persisted to disk. Cleared on restart (forces re-auth).
_current_pin: str | None = None

# Brute-force protection
_MAX_ATTEMPTS = 5
_LOCKOUT_SECONDS = 30
_failed_attempts = 0
_lockout_until = 0.0


def _pin_path() -> Path:
    return get_data_dir() / _PIN_FILE


def is_pin_set() -> bool:
    """Check if a PIN has been configured."""
    p = _pin_path()
    if not p.exists():
        return False
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return bool(data.get("pin_hash"))
    except Exception:
        return False


def set_pin(pin: str) -> None:
    """Set or change the PIN code.

    Args:
        pin: 4-6 digit string.

    Raises:
        ValueError: if PIN format is invalid.
    """
    global _current_pin

    if not pin.isdigit() or not (4 <= len(pin) <= 6):
        raise ValueError("PIN must be 4-6 digits")

    salt = bcrypt.gensalt(rounds=12)
    pin_hash = bcrypt.hashpw(pin.encode("utf-8"), salt).decode("utf-8")

    data = {"pin_hash": pin_hash}
    path = _pin_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # Invalidate all existing tokens and cached PIN (force re-auth with new PIN)
    _active_tokens.clear()
    _current_pin = None

    logger.info("PIN set/changed successfully")


def get_current_pin() -> str | None:
    """Return the in-memory cached PIN (set after successful verify).

    Returns None if the user hasn't unlocked the app yet in this session.
    Used by TelegramService to decrypt the session file on startup.
    """
    return _current_pin


def verify_pin(pin: str) -> str | None:
    """Verify PIN and return a session token on success, None on failure.

    Includes brute-force protection: after MAX_ATTEMPTS failures,
    locks out for LOCKOUT_SECONDS.
    """
    global _failed_attempts, _lockout_until, _current_pin

    # Check lockout
    now = time.time()
    if _failed_attempts >= _MAX_ATTEMPTS:
        if now < _lockout_until:
            remaining = int(_lockout_until - now)
            logger.warning("PIN verify blocked — lockout active (%ds remaining)", remaining)
            return None
        # Lockout expired — reset
        _failed_attempts = 0
        _lockout_until = 0.0

    path = _pin_path()
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        pin_hash = data.get("pin_hash", "")
    except Exception:
        return None

    if bcrypt.checkpw(pin.encode("utf-8"), pin_hash.encode("utf-8")):
        # Success — reset attempts, generate token, cache PIN for session decryption
        _failed_attempts = 0
        _lockout_until = 0.0
        _current_pin = pin
        token = secrets.token_hex(32)  # 64 hex chars
        _active_tokens.add(token)
        logger.info("PIN verified — session token issued")
        return token

    # Failure
    _failed_attempts += 1
    if _failed_attempts >= _MAX_ATTEMPTS:
        _lockout_until = now + _LOCKOUT_SECONDS
        logger.warning(
            "PIN verify failed (%d/%d) — lockout for %ds",
            _failed_attempts, _MAX_ATTEMPTS, _LOCKOUT_SECONDS,
        )
    else:
        logger.warning("PIN verify failed (%d/%d)", _failed_attempts, _MAX_ATTEMPTS)
    return None


def verify_token(token: str | None) -> bool:
    """Check if a session token is valid (exists in active set)."""
    if not token:
        return False
    return token in _active_tokens


def revoke_token(token: str | None) -> None:
    """Revoke a specific session token (logout)."""
    if not token:
        return
    _active_tokens.discard(token)


def revoke_all_tokens() -> None:
    """Revoke all session tokens (force re-auth for all clients)."""
    _active_tokens.clear()


def remove_pin() -> None:
    """Remove the PIN entirely (disables PIN protection)."""
    global _current_pin
    path = _pin_path()
    if path.exists():
        path.unlink()
    _active_tokens.clear()
    _current_pin = None
    logger.info("PIN removed — protection disabled")


def get_lockout_info() -> dict:
    """Return current lockout state for the UI."""
    now = time.time()
    locked = _failed_attempts >= _MAX_ATTEMPTS and now < _lockout_until
    return {
        "locked": locked,
        "remaining_seconds": max(0, int(_lockout_until - now)) if locked else 0,
        "failed_attempts": _failed_attempts,
        "max_attempts": _MAX_ATTEMPTS,
    }
