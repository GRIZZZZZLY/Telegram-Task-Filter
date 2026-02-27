"""WebSocket router — real-time task events for the UI.

Clients connect to WS /ws/tasks and receive JSON events:
  {"type": "task_created",   "data": {"task_id": 1, ...}}
  {"type": "task_committed", "data": {"task_id": 1}}
  {"type": "task_reopened",  "data": {"task_id": 1}}

Simple keepalive: client sends "ping", server responds "pong".
"""
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.notification_service import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ws"])


@router.websocket("/ws/tasks")
async def ws_tasks(websocket: WebSocket) -> None:
    """WebSocket endpoint — streams task lifecycle events to connected UI clients."""
    await manager.connect(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            if text.strip() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.warning("WS error: %s", exc)
        manager.disconnect(websocket)
