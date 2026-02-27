"""Telegram info router — lists available chats and threads for the settings UI.

GET /telegram/chats            — recently active dialogs
GET /telegram/threads/{chat_id} — topics/threads in a forum group
"""
import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException

from ..services.telegram_service import TelegramService
from ..workers.tg_listener import restart_listener

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telegram", tags=["telegram"])

# Simple in-process cache (ttl = 60 s)
_chats_cache: dict[str, Any] = {"ts": 0.0, "data": None}
_CACHE_TTL = 60.0


@router.get("/chats")
async def list_chats() -> list[dict]:
    """Return up to 50 recently active Telegram dialogs.

    Each item: { id, name, type }
    """
    client = TelegramService.get_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    now = time.monotonic()
    if now - _chats_cache["ts"] < _CACHE_TTL and _chats_cache["data"] is not None:
        return _chats_cache["data"]  # type: ignore[return-value]

    chats: list[dict] = []
    try:
        async for dialog in client.iter_dialogs(limit=50):
            entity = dialog.entity
            entity_type = type(entity).__name__

            # Determine human-readable type
            if "Channel" in entity_type:
                kind = "channel" if getattr(entity, "broadcast", False) else "supergroup"
            elif "Chat" in entity_type:
                kind = "group"
            elif "User" in entity_type:
                kind = "user"
            else:
                kind = "unknown"

            chats.append({
                "id": str(dialog.id),
                "name": dialog.name or f"id:{dialog.id}",
                "type": kind,
            })
    except Exception as exc:
        logger.error("Failed to list chats: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    _chats_cache["ts"] = now
    _chats_cache["data"] = chats
    return chats


@router.get("/threads/{chat_id}")
async def list_threads(chat_id: str) -> list[dict]:
    """Return topics/threads for a forum supergroup.

    Each item: { id, name }
    Returns [] for non-forum chats.
    """
    client = TelegramService.get_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    try:
        chat_id_int = int(chat_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="chat_id must be an integer string")

    threads: list[dict] = []
    try:
        # Resolve to InputPeer — required for GetForumTopicsRequest
        peer = await client.get_input_entity(chat_id_int)

        from telethon.tl.functions.messages import GetForumTopicsRequest  # noqa: PLC0415

        result = await client(
            GetForumTopicsRequest(
                peer=peer,
                q="",
                offset_date=None,
                offset_id=0,
                offset_topic=0,
                limit=100,
            )
        )
        for topic in result.topics:
            threads.append({
                "id": str(topic.id),
                "name": getattr(topic, "title", f"topic:{topic.id}"),
            })
    except Exception as exc:
        err_msg = str(exc)
        # Non-forum chats simply don't have topics
        if "not a forum" in err_msg.lower() or "CHANNEL_FORUM_MISSING" in err_msg:
            return []
        logger.warning("Failed to list threads for chat %s: %s", chat_id, exc)
        raise HTTPException(status_code=500, detail=err_msg) from exc

    return threads


@router.post("/restart-listener")
async def restart_listener_endpoint() -> dict:
    """Restart the Telethon message listener with current settings.

    Required after changing tg_monitored_chat_ids.
    All other settings (filter_*, mention_handles) are already
    reloaded per-message and don't need a restart.
    """
    await restart_listener()
    return {"ok": True, "message": "Listener restarted"}
