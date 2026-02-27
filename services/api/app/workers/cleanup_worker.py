"""Cleanup worker — periodically deletes old done tasks.

Runs every hour. Only active when settings.cleanup_done_after_days > 0.
"""
import asyncio
import logging

from ..config import get_settings
from ..database import SessionLocal
from ..services.task_service import TaskService

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 3600  # run once per hour


async def cleanup_worker() -> None:
    """Background task: delete done tasks older than configured threshold."""
    logger.info("Cleanup worker started (interval=%ds)", _INTERVAL_SECONDS)
    while True:
        await asyncio.sleep(_INTERVAL_SECONDS)
        settings = get_settings()
        days = settings.cleanup_done_after_days
        if days <= 0:
            continue

        db = SessionLocal()
        try:
            svc = TaskService(db)
            deleted = svc.clear_done(older_than_days=days)
            if deleted:
                logger.info("Cleanup worker: deleted %d done task(s) older than %d day(s)", deleted, days)
        except Exception as exc:
            logger.error("Cleanup worker error: %s", exc)
        finally:
            db.close()
