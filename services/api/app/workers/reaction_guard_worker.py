"""Reaction guard worker.

Periodically audits recently sent reactions and rolls back any reaction/reply
that was placed on a message without the configured mention handle.

This is a safety net in case rules/configurations were wrong or changed.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from ..database import SessionLocal
from ..models import Event, EventType, Task, TaskStatus
from ..services.telegram_service import TelegramService

logger = logging.getLogger(__name__)


async def run_reaction_guard_worker(
    interval_seconds: int = 180,
    lookback_hours: int = 72,
    batch_size: int = 200,
) -> None:
    """Run guard checks forever until cancelled."""
    logger.info(
        "Reaction guard worker started | interval=%ds lookback=%dh batch=%d",
        interval_seconds,
        lookback_hours,
        batch_size,
    )
    while True:
        try:
            stats = await run_reaction_guard_once(
                lookback_hours=lookback_hours,
                batch_size=batch_size,
            )
            if stats["checked"] or stats["rolled_back"]:
                logger.info(
                    "Reaction guard tick | checked=%d ok=%d rolled_back=%d skipped=%d",
                    stats["checked"],
                    stats["ok"],
                    stats["rolled_back"],
                    stats["skipped"],
                )
        except asyncio.CancelledError:
            logger.info("Reaction guard worker stopped")
            raise
        except Exception as exc:
            logger.error("Reaction guard worker tick error: %s", exc, exc_info=True)
        await asyncio.sleep(interval_seconds)


async def run_reaction_guard_once(lookback_hours: int = 72, batch_size: int = 200) -> dict:
    """Run one guard pass immediately and return stats.

    Returns:
      {
        "checked": int,
        "ok": int,
        "rolled_back": int,
        "skipped": int,
      }
    """
    from ..config import get_settings

    stats = {"checked": 0, "ok": 0, "rolled_back": 0, "skipped": 0}

    settings = get_settings()
    handles = settings.get_mention_handles()
    if not handles:
        # No configured handles => nothing can pass strict mention check.
        # Skip automatic rollback to avoid removing everything unexpectedly.
        logger.warning("Reaction guard skipped: mention handles are empty")
        stats["skipped"] += 1
        return stats

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=lookback_hours)

    db = SessionLocal()
    tg = TelegramService()
    try:
        events = (
            db.query(Event)
            .filter(Event.type == EventType.reaction_sent, Event.ts >= since)
            .order_by(Event.id.desc())
            .limit(batch_size)
            .all()
        )
        if not events:
            return stats

        for ev in events:
            payload: dict
            try:
                payload = json.loads(ev.payload_json or "{}")
            except Exception:
                payload = {}

            if payload.get("guard_checked_at"):
                stats["skipped"] += 1
                continue

            chat_id = str(payload.get("chat_id") or "")
            msg_id_raw = payload.get("source_message_id")
            reply_message_id_raw = payload.get("reply_message_id")
            if not chat_id or not msg_id_raw:
                stats["checked"] += 1
                stats["skipped"] += 1
                payload["guard_checked_at"] = datetime.now(timezone.utc).isoformat()
                payload["guard_ok"] = False
                payload["guard_error"] = "missing_chat_or_message_id"
                ev.payload_json = json.dumps(payload)
                db.commit()
                continue

            msg_id = int(msg_id_raw)
            reply_message_id = int(reply_message_id_raw) if reply_message_id_raw else None

            allowed = await tg.message_mentions_handles(
                chat_id=chat_id,
                message_id=msg_id,
                mention_handles=handles,
            )

            stats["checked"] += 1

            payload["guard_checked_at"] = datetime.now(timezone.utc).isoformat()
            payload["guard_ok"] = bool(allowed)

            if allowed:
                stats["ok"] += 1
                ev.payload_json = json.dumps(payload)
                db.commit()
                continue

            logger.warning(
                "Reaction guard rollback | event_id=%d task_id=%d chat=%s msg=%d",
                ev.id,
                ev.task_id,
                chat_id,
                msg_id,
            )

            remove_result = await tg.remove_done(
                chat_id=chat_id,
                message_id=msg_id,
                reply_message_id=reply_message_id,
            )

            task = db.query(Task).filter(Task.id == ev.task_id).first()
            if task:
                task.status = TaskStatus.inbox
                task.committed_at = None
                task.custom_reply = None

            db.add(
                Event(
                    task_id=ev.task_id,
                    type=EventType.error,
                    payload_json=json.dumps(
                        {
                            "guard": "rollback_no_mention",
                            "chat_id": chat_id,
                            "source_message_id": msg_id,
                            "remove_result": remove_result,
                            "ts": datetime.now(timezone.utc).isoformat(),
                        }
                    ),
                )
            )

            payload["guard_rolled_back"] = True
            payload["remove_result"] = remove_result
            ev.payload_json = json.dumps(payload)
            db.commit()
            stats["rolled_back"] += 1
    finally:
        db.close()

    return stats
