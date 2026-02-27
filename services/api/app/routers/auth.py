"""Auth router — Setup Wizard endpoint.

Provides a programmatic way for the UI to initiate Telegram auth instead of
running console scripts manually.

Endpoints:
    POST /auth/start   — save credentials to .env, send OTP to Telegram
    POST /auth/verify  — submit OTP (+ optional 2FA) to complete auth
    GET  /auth/status  — check whether Telegram is connected
"""
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..path_utils import get_sessions_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Module-level state for the in-progress auth flow
_pending_client = None   # TelegramClient | None
_phone_code_hash: Optional[str] = None

_SESSIONS_DIR = get_sessions_dir()


# ── Schemas ───────────────────────────────────────────────────────────────────

class AuthStartRequest(BaseModel):
    api_id: int
    api_hash: str
    phone: str


class AuthStartResponse(BaseModel):
    status: str
    hint: str


class AuthVerifyRequest(BaseModel):
    code: str
    password: Optional[str] = None


class AuthVerifyResponse(BaseModel):
    status: str
    username: Optional[str]
    first_name: Optional[str]


class AuthStatusResponse(BaseModel):
    authenticated: bool
    session_exists: bool
    has_credentials: bool
    username: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_client(session_path: str, api_id: int, api_hash: str):
    from telethon import TelegramClient

    return TelegramClient(
        session_path,
        api_id,
        api_hash,
        device_model="Desktop",
        system_version="Linux",
        app_version="1.0",
        lang_code="ru",
        system_lang_code="ru-RU",
    )


def _session_file() -> Path:
    """Return expected session file path based on current settings."""
    from ..config import get_settings
    return _SESSIONS_DIR / f"{get_settings().tg_session_name}.session"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status", response_model=AuthStatusResponse)
async def auth_status():
    """Return whether Telegram is connected and a session file exists."""
    from ..config import get_settings
    from ..services.telegram_service import TelegramService

    settings = get_settings()
    has_credentials = bool(settings.tg_api_id and settings.tg_api_hash)
    connected = TelegramService.is_available()

    username: str | None = None
    if connected:
        try:
            client = TelegramService.get_client()
            if client:
                me = await client.get_me()
                username = f"@{me.username}" if getattr(me, "username", None) else getattr(me, "first_name", None)
        except Exception:
            pass

    return AuthStatusResponse(
        authenticated=connected,
        session_exists=_session_file().exists(),
        has_credentials=has_credentials,
        username=username,
    )


@router.post("/start", response_model=AuthStartResponse)
async def auth_start(body: AuthStartRequest):
    """Save TG credentials to .env and send the verification code to Telegram."""
    global _pending_client, _phone_code_hash

    # 1. Persist credentials so they survive backend restarts
    try:
        from ..config import save_tg_credentials
        save_tg_credentials(body.api_id, body.api_hash, body.phone)
        logger.info("TG credentials saved to .env")
    except Exception as exc:
        logger.warning("Could not save credentials to .env: %s", exc)

    # 2. Clean up any previous pending client
    if _pending_client is not None:
        try:
            await _pending_client.disconnect()
        except Exception:
            pass
        _pending_client = None
        _phone_code_hash = None

    # 3. Create client and send code
    try:
        from ..config import get_settings

        _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        session_path = str(_SESSIONS_DIR / get_settings().tg_session_name)

        client = _make_client(session_path, body.api_id, body.api_hash)
        await client.connect()

        result = await client.send_code_request(body.phone)
        _phone_code_hash = result.phone_code_hash
        _pending_client = client

        logger.info("Auth code sent to %s", body.phone)
        return AuthStartResponse(
            status="code_sent",
            hint=f"Код отправлен на {body.phone}. Откройте Telegram → чат 777000.",
        )

    except Exception as exc:
        _pending_client = None
        _phone_code_hash = None
        logger.error("auth_start failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/verify", response_model=AuthVerifyResponse)
async def auth_verify(body: AuthVerifyRequest):
    """Submit OTP (and optional 2FA password) to complete authentication."""
    global _pending_client, _phone_code_hash

    if _pending_client is None or _phone_code_hash is None:
        raise HTTPException(
            status_code=400,
            detail="Сначала вызовите POST /auth/start",
        )

    try:
        from telethon.errors import SessionPasswordNeededError

        client = _pending_client

        try:
            await client.sign_in(
                phone_code_hash=_phone_code_hash,
                code=body.code.strip(),
            )
        except SessionPasswordNeededError:
            if not body.password:
                raise HTTPException(
                    status_code=422,
                    detail="Требуется пароль 2FA. Передайте поле 'password'.",
                ) from None
            await client.sign_in(password=body.password)

        me = await client.get_me()
        await client.disconnect()

        _pending_client = None
        _phone_code_hash = None

        # Reload TelegramService with the new session
        from ..services.telegram_service import TelegramService
        from ..workers.tg_listener import start_listener

        if TelegramService.is_available():
            await TelegramService.stop()
        await TelegramService.start()
        await start_listener()

        logger.info("Auth complete | @%s", getattr(me, "username", "?"))
        return AuthVerifyResponse(
            status="ok",
            username=getattr(me, "username", None),
            first_name=getattr(me, "first_name", None),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("auth_verify failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
