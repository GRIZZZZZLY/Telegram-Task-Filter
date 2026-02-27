"""Settings router — GET /settings, PATCH /settings."""
import logging

from fastapi import APIRouter

from ..config import get_settings, save_settings
from ..schemas import SettingsIn, SettingsOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_all_settings() -> SettingsOut:
    """Return current application settings (safe subset — no secrets)."""
    s = get_settings()
    # Expose tg_mention_handles: prefer the multi-handle field, fall back to legacy
    handles = s.tg_mention_handles.strip() or s.tg_mention_handle.strip()
    return SettingsOut(
        tg_mention_handles=handles,
        tg_monitored_chat_ids=s.tg_monitored_chat_ids,
        tg_monitored_thread_ids=s.tg_monitored_thread_ids,
        done_reaction=s.done_reaction,
        done_send_reply=s.done_send_reply,
        done_reply_text=s.done_reply_text,
        done_commit_delay_seconds=s.done_commit_delay_seconds,
        filter_ignore_own=s.filter_ignore_own,
        filter_min_text_length=s.filter_min_text_length,
        filter_strict_mentions=s.filter_strict_mentions,
        cleanup_done_after_days=s.cleanup_done_after_days,
        sound_enabled=s.sound_enabled,
        compact_mode=s.compact_mode,
    )


@router.patch("", response_model=SettingsOut)
def update_settings(body: SettingsIn) -> SettingsOut:
    """Persist changed settings to .env.  Only non-None fields are updated."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        save_settings(updates)
        logger.info("Settings updated: %s", list(updates.keys()))
    return get_all_settings()
