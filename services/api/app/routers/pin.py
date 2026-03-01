"""PIN authentication router.

Endpoints:
    GET  /auth/pin/status  — is PIN configured? is lockout active?
    POST /auth/pin/set     — set or change PIN (requires current PIN if already set)
    POST /auth/pin/verify  — verify PIN → get session token
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from ..services.pin_service import (
    get_lockout_info,
    is_pin_set,
    set_pin,
    verify_pin,
)
from ..services.session_crypto import encrypt_session, is_encrypted
from ..services.dpapi_service import migrate_keys_from_env, is_dpapi_available
from ..path_utils import get_sessions_dir, get_data_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/pin", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PinSetRequest(BaseModel):
    pin: str
    current_pin: Optional[str] = None  # required if PIN is already set

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: str) -> str:
        if not v.isdigit() or not (4 <= len(v) <= 6):
            raise ValueError("PIN must be 4-6 digits")
        return v


class PinVerifyRequest(BaseModel):
    pin: str


class PinStatusResponse(BaseModel):
    pin_set: bool
    locked: bool
    remaining_seconds: int
    failed_attempts: int
    max_attempts: int


class PinVerifyResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    locked: bool = False
    remaining_seconds: int = 0


class PinSetResponse(BaseModel):
    ok: bool
    token: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status", response_model=PinStatusResponse)
def pin_status():
    """Check if PIN is configured and current lockout state."""
    lockout = get_lockout_info()
    return PinStatusResponse(
        pin_set=is_pin_set(),
        **lockout,
    )


@router.post("/set", response_model=PinSetResponse)
async def pin_set(body: PinSetRequest):
    """Set or change the PIN code.

    If a PIN is already set, `current_pin` must be provided and correct.
    Returns a new session token on success.
    """
    if is_pin_set():
        # Changing PIN — verify current first
        if not body.current_pin:
            raise HTTPException(
                status_code=400,
                detail="Для смены PIN укажите текущий PIN в поле current_pin",
            )
        token = verify_pin(body.current_pin)
        if token is None:
            lockout = get_lockout_info()
            if lockout["locked"]:
                raise HTTPException(
                    status_code=429,
                    detail=f"Слишком много попыток. Подождите {lockout['remaining_seconds']}с",
                )
            raise HTTPException(status_code=403, detail="Неверный текущий PIN")

    try:
        set_pin(body.pin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Stop Telegram client before in-place session encryption (avoids file-lock issues).
    await _safe_stop_telegram()

    # Encrypt existing session file with the new PIN (if not already encrypted).
    _encrypt_existing_session(body.pin)

    # Migrate TG_API_ID / TG_API_HASH from .env → DPAPI (Windows only, idempotent).
    _migrate_env_secrets()

    # Issue a fresh token after setting PIN
    token = verify_pin(body.pin)

    # Try to reconnect Telegram immediately after PIN setup/change.
    await _safe_start_telegram()

    return PinSetResponse(ok=True, token=token)


def _encrypt_existing_session(pin: str) -> None:
    """Encrypt the Telegram session file with the given PIN.

    Called after PIN is set/changed. Idempotent — skips if already encrypted.
    Logs a warning on failure but does not raise (non-fatal).
    """
    from ..config import get_settings

    try:
        settings = get_settings()
        sessions_dir = get_sessions_dir()
        session_file = sessions_dir / f"{settings.tg_session_name}.session"

        if not session_file.exists():
            logger.debug("No session file to encrypt at %s", session_file)
            return

        if is_encrypted(session_file):
            logger.debug("Session already encrypted — skipping")
            return

        encrypt_session(session_file, pin)
        logger.info("Session file encrypted after PIN set: %s", session_file.name)

    except Exception as exc:
        logger.warning("Could not encrypt session file: %s", exc)


@router.post("/verify", response_model=PinVerifyResponse)
async def pin_verify(body: PinVerifyRequest):
    """Verify PIN and receive a session token.

    The token must be sent as `Authorization: Bearer <token>` on all
    subsequent API requests.
    """
    if not is_pin_set():
        raise HTTPException(status_code=400, detail="PIN не установлен")

    token = verify_pin(body.pin)
    if token is not None:
        # Migration safety: if user had PIN before S2 and session is still plaintext,
        # encrypt it now after successful unlock.
        await _ensure_session_encrypted_after_unlock(body.pin)

        # If Telegram was unavailable at startup due to encrypted session + locked PIN,
        # reconnect now that we have the PIN in memory.
        await _safe_start_telegram()
        return PinVerifyResponse(success=True, token=token)

    # Failed — return lockout info
    lockout = get_lockout_info()
    return PinVerifyResponse(
        success=False,
        locked=lockout["locked"],
        remaining_seconds=lockout["remaining_seconds"],
    )


async def _safe_stop_telegram() -> None:
    """Stop TelegramService if connected (best-effort)."""
    from ..services.telegram_service import TelegramService

    if not TelegramService.is_available():
        return

    try:
        await TelegramService.stop()
    except Exception as exc:
        logger.warning("Could not stop Telegram before session encryption: %s", exc)


async def _safe_start_telegram() -> None:
    """Start TelegramService + listener if not connected (best-effort)."""
    from ..services.telegram_service import TelegramService
    from ..workers.tg_listener import start_listener

    if TelegramService.is_available():
        return

    try:
        await TelegramService.start()
        await start_listener()
    except Exception as exc:
        logger.warning("Could not start Telegram after PIN operation: %s", exc)


async def _ensure_session_encrypted_after_unlock(pin: str) -> None:
    """Encrypt plaintext session after successful PIN unlock (best-effort).

    This handles migration cases where PIN was set before S2 and .session stayed
    unencrypted. Idempotent: no-op if file is missing or already encrypted.
    """
    from ..config import get_settings

    try:
        settings = get_settings()
        session_file = get_sessions_dir() / f"{settings.tg_session_name}.session"

        if not session_file.exists() or is_encrypted(session_file):
            return

        await _safe_stop_telegram()
        _encrypt_existing_session(pin)
    except Exception as exc:
        logger.warning("Could not auto-encrypt session after unlock: %s", exc)


def _migrate_env_secrets() -> None:
    """Move TG_API_ID / TG_API_HASH from .env into DPAPI (best-effort, idempotent).

    Called after PIN is set/changed so that sensitive credentials are no longer
    stored as plaintext in the .env file.
    """
    if not is_dpapi_available():
        logger.debug("DPAPI not available — skipping .env migration")
        return

    try:
        env_path = get_data_dir() / ".env"
        if not env_path.exists():
            return
        migrated = migrate_keys_from_env(env_path)
        if migrated:
            # Refresh settings cache so new reads use DPAPI
            from ..config import get_settings
            get_settings.cache_clear()
    except Exception as exc:
        logger.warning("Could not migrate .env secrets to DPAPI: %s", exc)
