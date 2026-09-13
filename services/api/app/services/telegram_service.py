"""Telegram interaction service — Telethon implementation.

Lifecycle (called from FastAPI lifespan in main.py):
    await TelegramService.start()   # on startup
    await TelegramService.stop()    # on shutdown

IMPORTANT — first-run authentication:
    Run `python scripts/auth_telegram.py` ONCE before starting the server.
    This creates a session file in sessions/ that is reused on every startup.
    Without it, the server will log a warning and run without Telegram.

Session encryption:
    If a PIN is set, the .session file is stored encrypted (AES-256-GCM).
    On startup it is decrypted to a temporary file, read into an in-memory
    StringSession, and the temp file is deleted immediately — Telethon never
    holds the plaintext copy open, so it cannot outlive the call.
    If no PIN is set, the session file is used as-is (backward-compatible).

    In-memory means session updates (entity cache, update state) are not
    persisted. That was already true of the previous temp-file approach: the
    encrypted file on disk was never written back after authentication.
"""
import asyncio
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

    _start_lock: asyncio.Lock | None = None

    @classmethod
    async def start(cls) -> None:
        """Serialised entry point.

        Two PIN unlocks arriving together (seen in dev: React StrictMode) must
        not both decrypt the session and open two Telethon clients.
        """
        if cls._start_lock is None:
            cls._start_lock = asyncio.Lock()
        async with cls._start_lock:
            if cls.is_available():
                return
            await cls._start_unlocked()

    @classmethod
    async def _start_unlocked(cls) -> None:
        """Connect to Telegram using an existing session file.

        Does nothing if:
          - TG_API_ID / TG_API_HASH are not set in .env
          - Session file does not exist (run auth_telegram.py first)

        If a PIN is set, the session is decrypted into memory before
        connecting; see _load_session.
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

        session_file = session_path.with_suffix(".session")
        cls._purge_stale_temp_sessions(session_file.parent)

        # Either a path string (plaintext session on disk) or an in-memory
        # StringSession (decrypted from the encrypted file). None = stay locked.
        session = cls._load_session(session_file)
        if session is None:
            return

        try:
            from telethon import TelegramClient

            cls._client = TelegramClient(
                session,
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

    @staticmethod
    def _purge_stale_temp_sessions(sessions_dir: Path) -> None:
        """Delete plaintext session copies left behind by earlier versions.

        Before the in-memory switch, every start decrypted the session to a
        file Telethon kept open, so deletion was deferred to stop() and never
        happened on a hard exit. Copies accumulated indefinitely.
        """
        removed = 0
        for stale in sessions_dir.glob("_tgff_dec_*"):
            try:
                stale.unlink()
                removed += 1
            except OSError:
                pass  # still locked by another instance — a later start gets it
        if removed:
            logger.info("Removed %d leftover plaintext session copies", removed)

    @classmethod
    def _load_session(cls, session_file: Path):
        """Return what Telethon should open, or None to stay disconnected.

        Plaintext session (no PIN): the path, so Telethon persists updates.
        Encrypted session: decrypt to a temp file, read it into an in-memory
        StringSession, delete the temp file at once. The plaintext key never
        outlives this call.
        """
        from .pin_service import is_pin_set, get_current_pin
        from .session_crypto import decrypt_session, is_encrypted

        if not is_pin_set() or not is_encrypted(session_file):
            # Telethon appends .session itself
            return str(session_file.with_suffix(""))

        pin = get_current_pin()
        if pin is None:
            # PIN is set but not yet verified (app just started, user hasn't unlocked yet).
            # We cannot decrypt without the PIN — Telegram connects after unlock.
            logger.warning(
                "Session is encrypted but PIN not yet verified — "
                "Telegram will connect after first PIN unlock."
            )
            return None

        try:
            temp_path = decrypt_session(session_file, pin)
        except ValueError as exc:
            logger.error("Session decryption failed: %s", exc)
            return None

        try:
            from telethon.sessions import SQLiteSession, StringSession

            on_disk = SQLiteSession(str(temp_path.with_suffix("")))
            try:
                if on_disk.auth_key is None:
                    logger.warning("Decrypted session carries no auth key — not authorized")
                    return None
                return StringSession(StringSession.save(on_disk))
            finally:
                on_disk.close()
        finally:
            # Runs even when SQLiteSession raises: no plaintext copy is left.
            temp_path.unlink(missing_ok=True)

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

        if reaction:
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
        else:
            logger.info("Reaction skipped (disabled) | chat=%s msg=%d", chat_id, message_id)

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

    async def message_mentions_handles(
        self,
        chat_id: str,
        message_id: int,
        mention_handles: list[str],
    ) -> bool:
        """Return True if message mentions one of provided handles.

        Supports both:
        - textual @mentions (MessageEntityMention)
        - direct user mentions without @username (MessageEntityMentionName)

        If the message cannot be fetched, returns False (safe default).
        """
        client = self.__class__._client
        if not self.__class__.is_available():
            # Telethon not connected — commit_worker already guards against this
            # case (defers the task). If we somehow reach here anyway, allow the
            # commit rather than silently reverting the user's Done action.
            logger.warning("[SKIP] mention_check — Telethon not connected (allowing)")
            return True

        handles_lower = [h.strip().lower() for h in mention_handles if h.strip()]
        if not handles_lower:
            # No handles configured — nothing to check against, allow the commit.
            # The task was already validated by the listener when it was created.
            logger.debug("mention_check skipped — no handles configured")
            return True

        try:
            msg = await client.get_messages(int(chat_id), ids=message_id)
            if not msg:
                # Message not found (deleted?) — allow the commit rather than
                # silently reverting the user's Done action.
                logger.warning(
                    "mention_check: message not found | chat=%s msg=%d — allowing commit",
                    chat_id, message_id,
                )
                return True

            text = msg.raw_text or ""
            entities = msg.entities or []

            me = await client.get_me()
            my_user_id = getattr(me, "id", None)

            from telethon.tl.types import MessageEntityMention, MessageEntityMentionName

            found: list[str] = []
            for ent in entities:
                if isinstance(ent, MessageEntityMention):
                    found.append(text[ent.offset: ent.offset + ent.length].lower())
                elif isinstance(ent, MessageEntityMentionName):
                    if my_user_id is not None and ent.user_id == my_user_id:
                        # Direct mention of current user (works even without public @username)
                        return True

            return any(m in handles_lower for m in found)
        except Exception as exc:
            # Network error / rate limit / Telegram API hiccup.
            # Return True (allow) — a transient check failure must not silently
            # revert the user's Done action. The task was already validated by
            # the listener when it was created.
            logger.warning(
                "mention_check failed (allowing commit) | chat=%s msg=%d err=%s",
                chat_id,
                message_id,
                exc,
            )
            return True

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
