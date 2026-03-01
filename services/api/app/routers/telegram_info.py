"""Telegram info router — lists available chats and threads for the settings UI.

GET  /telegram/chats            — recently active dialogs
GET  /telegram/threads/{chat_id} — topics/threads in a forum group
POST /telegram/scan-history     — manual catch-up scan (returns stats)
POST /telegram/guard-check      — run one reaction guard pass now
"""
import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..services.telegram_service import TelegramService
from ..workers.tg_listener import restart_listener

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telegram", tags=["telegram"])

# Simple in-process cache (ttl = 60 s)
_chats_cache: dict[str, Any] = {"ts": 0.0, "data": None}
_CACHE_TTL = 60.0


@router.get("/chats")
async def list_chats() -> list[dict]:
    """Return selectable Telegram dialogs (up to 300 raw dialogs scanned).

    Selection policy (to reduce noise in settings):
      - include supergroups only
      - include ONE user dialog only: your own "Saved Messages" chat

    Excludes:
      - channels
      - regular users
      - legacy basic groups

    Each item: { id, name, type }.
    """
    client = TelegramService.get_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Telegram client not connected")

    now = time.monotonic()
    if now - _chats_cache["ts"] < _CACHE_TTL and _chats_cache["data"] is not None:
        return _chats_cache["data"]  # type: ignore[return-value]

    chats: list[dict] = []
    try:
        async for dialog in client.iter_dialogs(limit=300):
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

            # Keep only supergroups and personal Saved Messages dialog.
            is_saved_messages = bool(getattr(entity, "is_self", False))
            keep = (kind == "supergroup") or (kind == "user" and is_saved_messages)
            if not keep:
                continue

            chats.append({
                "id": str(dialog.id),
                "name": dialog.name or f"id:{dialog.id}",
                "type": "saved" if is_saved_messages else kind,
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
        # Fast pre-check: if the chat is not a forum supergroup, return []
        entity = await client.get_entity(chat_id_int)
        if not getattr(entity, "forum", False):
            return []

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
        # Non-forum/inaccessible chats should not be treated as hard errors.
        # Telethon often returns terse messages like:
        #   " (caused by GetForumTopicsRequest)"
        # when forum topics are unavailable.
        non_forum_markers = (
            "not a forum",
            "channel_forum_missing",
            "forum",
            "getforumtopicsrequest",
            "topic",
            "channel_invalid",
            "channel_private",
            "chat_admin_required",
        )
        if any(m in err_msg.lower() for m in non_forum_markers):
            return []
        logger.warning("Failed to list threads for chat %s: %s", chat_id, exc)
        raise HTTPException(status_code=500, detail=err_msg) from exc

    return threads


@router.post("/scan-history")
async def scan_history(
    hours: int = Query(default=8, ge=1, le=168, description="How many hours back to scan (max 7 days)"),
) -> dict:
    """Manually trigger a catch-up scan of recent message history.

    Returns { scanned, created, skipped_done, skipped_dup }.
    """
    from ..workers.catchup_worker import run_catchup  # noqa: PLC0415

    try:
        stats = await run_catchup(scan_hours=hours)
        return {"ok": True, **stats}
    except Exception as exc:
        logger.error("Manual scan-history failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/guard-check")
async def guard_check_now(
    hours: int = Query(default=72, ge=1, le=720, description="How many hours back to audit"),
    batch: int = Query(default=300, ge=10, le=2000, description="Max reaction events to inspect"),
) -> dict:
    """Run one reaction guard pass immediately.

    Returns { ok, checked, ok_count, rolled_back, skipped }.
    """
    from ..workers.reaction_guard_worker import run_reaction_guard_once  # noqa: PLC0415

    try:
        stats = await run_reaction_guard_once(lookback_hours=hours, batch_size=batch)
        return {
            "ok": True,
            "checked": stats["checked"],
            "ok_count": stats["ok"],
            "rolled_back": stats["rolled_back"],
            "skipped": stats["skipped"],
        }
    except Exception as exc:
        logger.error("Manual guard-check failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/restart-listener")
async def restart_listener_endpoint() -> dict:
    """Restart the Telethon message listener with current settings.

    Required after changing tg_monitored_chat_ids.
    All other settings (filter_*, mention_handles) are already
    reloaded per-message and don't need a restart.
    """
    await restart_listener()
    return {"ok": True, "message": "Listener restarted"}
