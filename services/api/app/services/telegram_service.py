"""Telegram interaction service — Telethon implementation.

Lifecycle (called from FastAPI lifespan in main.py):
    await TelegramService.start()   # on startup
    await TelegramService.stop()    # on shutdown

IMPORTANT — first-run authentication:
    Run `python scripts/auth_telegram.py` ONCE before starting the server.
    This creates a session file in sessions/ that is reused on every startup.
    Without it, the server will log a warning and run without Telegram.
"""
import logging
from pathlib import Path
from typing import Optional

from ..path_utils import get_sessions_dir

logger = logging.getLogger(__name__)

# Resolved via path_utils — works in both dev (project root) and packaged (AppData)
_SESSIONS_DIR = get_sessions_dir()


class TelegramService:
    """Manages Telethon client lifecycle and Telegram API operations.

    The client is a class-level singleton shared across all instances.
    """

    _client = None  # telethon.TelegramClient | None

    # ── Lifecycle ──────────────────────────────────────────────────────────

    @classmethod
    async def start(cls) -> None:
        """Connect to Telegram using an existing session file.

        Does nothing if:
          - TG_API_ID / TG_API_HASH are not set in .env
          - Session file does not exist (run auth_telegram.py first)
        """
        from ..config import get_settings

        settings = get_settings()

        if not settings.tg_api_id or not settings.tg_api_hash:
            logger.warning(
                "TG_API_ID or TG_API_HASH not set — Telegram integration disabled"
            )
            return

        session_path = _SESSIONS_DIR / settings.tg_session_name
        if not session_path.with_suffix(".session").exists():
            # Fallback: session may have been created in the project root
            # (dev mode without Electron setting APP_DATA_DIR).
            # Auto-migrate so the user doesn't have to re-authenticate.
            _dev_fallback = Path(__file__).parents[3] / "sessions" / settings.tg_session_name
            if _dev_fallback.with_suffix(".session").exists():
                import shutil as _shutil
                _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
                _shutil.copy2(
                    str(_dev_fallback.with_suffix(".session")),
                    str(session_path.with_suffix(".session")),
                )
                logger.info(
                    "Session migrated: %s → %s",
                    _dev_fallback.with_suffix(".session"),
                    session_path.with_suffix(".session"),
                )
            else:
                logger.warning(
                    "Session file not found at %s.session — "
                    "authenticate via the app UI first.",
                    session_path,
                )
                return

        try:
            from telethon import TelegramClient

            cls._client = TelegramClient(
                str(session_path),
                int(settings.tg_api_id),
                settings.tg_api_hash,
                device_model="Desktop",
                system_version="Linux",
                app_version="1.0",
                lang_code="ru",
                system_lang_code="ru-RU",
            )
            # connect() never prompts interactively — safe for server startup
            await cls._client.connect()

            if not await cls._client.is_user_authorized():
                logger.warning(
                    "Session file exists but is not authorized — "
                    "run `python scripts/auth_telegram.py send <phone>` to re-authenticate."
                )
                await cls._client.disconnect()
                cls._client = None
                return

            me = await cls._client.get_me()
            logger.info(
                "Telethon connected | @%s (%s %s)",
                me.username,
                me.first_name,
                me.last_name or "",
            )
        except Exception as exc:
            logger.error("Telethon start failed: %s", exc)
            cls._client = None

    @classmethod
    async def stop(cls) -> None:
        """Disconnect Telethon client gracefully."""
        if cls._client and cls._client.is_connected():
            await cls._client.disconnect()
            logger.info("Telethon disconnected")
        cls._client = None

    @classmethod
    def get_client(cls):
        """Return the active TelegramClient or None."""
        return cls._client

    @classmethod
    def is_available(cls) -> bool:
        return cls._client is not None and cls._client.is_connected()

    # ── Operations ─────────────────────────────────────────────────────────

    async def send_done(
        self,
        chat_id: str,
        message_id: int,
        reaction: str = "✅",
        send_reply: bool = False,
        reply_text: str = "Готово ✅",
    ) -> dict:
        """Put a reaction on a Telegram message. Optionally send a reply.

        Returns {"reply_message_id": int | None}.
        Logs a warning and returns safely if client is not connected.
        """
        client = self.__class__._client
        if not self.__class__.is_available():
            logger.warning("[SKIP] send_done — Telethon not connected")
            return {"reply_message_id": None}

        try:
            from telethon.tl.functions.messages import SendReactionRequest
            from telethon.tl.types import ReactionEmoji

            await client(
                SendReactionRequest(
                    peer=int(chat_id),
                    msg_id=message_id,
                    reaction=[ReactionEmoji(emoticon=reaction)],
                )
            )
            logger.info(
                "Reaction sent | chat=%s msg=%d reaction=%s",
                chat_id, message_id, reaction,
            )
        except Exception as exc:
            logger.error("send_reaction failed: %s", exc)

        reply_message_id: Optional[int] = None
        if send_reply:
            try:
                msg = await client.send_message(
                    int(chat_id), reply_text, reply_to=message_id
                )
                reply_message_id = msg.id
                logger.info("Reply sent | msg_id=%d", reply_message_id)
            except Exception as exc:
                logger.error("send_reply failed: %s", exc)

        return {"reply_message_id": reply_message_id}

    async def remove_done(
        self,
        chat_id: str,
        message_id: int,
        reply_message_id: Optional[int] = None,
    ) -> dict:
        """Remove reaction. Delete reply message if we sent it.

        Returns {"reaction_removed": bool, "reply_deleted": bool}.
        reply_deleted=False when message is older than 48h or no permissions.
        """
        client = self.__class__._client
        if not self.__class__.is_available():
            logger.warning("[SKIP] remove_done — Telethon not connected")
            return {"reaction_removed": False, "reply_deleted": False}

        reaction_removed = False
        try:
            from telethon.tl.functions.messages import SendReactionRequest

            await client(
                SendReactionRequest(
                    peer=int(chat_id),
                    msg_id=message_id,
                    reaction=[],  # empty list = remove reaction
                )
            )
            reaction_removed = True
            logger.info("Reaction removed | chat=%s msg=%d", chat_id, message_id)
        except Exception as exc:
            logger.error("remove_reaction failed: %s", exc)

        reply_deleted = False
        if reply_message_id:
            try:
                await client.delete_messages(int(chat_id), [reply_message_id])
                reply_deleted = True
                logger.info("Reply deleted | msg_id=%d", reply_message_id)
            except Exception as exc:
                # Most common: message older than 48h or no permission
                logger.warning("delete_reply failed (likely >48h or no perms): %s", exc)

        return {"reaction_removed": reaction_removed, "reply_deleted": reply_deleted}
