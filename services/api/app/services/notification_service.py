"""WebSocket connection manager.

Manages active WebSocket connections and broadcasts events to UI clients.
Singleton `manager` is used by both the router and background workers.

Event format (JSON sent to clients):
    {"type": "task_created",    "data": {"task_id": 1, "title": "...", "priority": "high"}}
    {"type": "task_committed",  "data": {"task_id": 1}}
    {"type": "task_reopened",   "data": {"task_id": 1}}
"""
import json
import logging
from typing import Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class _ConnectionManager:
    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.info("WS client connected | total=%d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        logger.info("WS client disconnected | total=%d", len(self._connections))

    async def broadcast(self, event_type: str, data: dict) -> None:
        """Send a JSON event to all connected WebSocket clients.

        Dead connections are silently removed.
        """
        if not self._connections:
            return

        message = json.dumps({"type": event_type, "data": data})
        dead: Set[WebSocket] = set()

        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception as exc:
                logger.debug("WS send failed (%s) — removing client", exc)
                dead.add(ws)

        self._connections -= dead

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Module-level singleton — import this everywhere
manager = _ConnectionManager()
