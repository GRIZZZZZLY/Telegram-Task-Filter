"""Application settings via pydantic-settings.

In dev:      reads .env from the project root (resolved via __file__).
In packaged: reads .env from APP_DATA_DIR set by Electron (user's AppData folder).
             Bundled read-only resources (rules.yaml) come from sys._MEIPASS.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .path_utils import get_bundled_resource, get_data_dir

_DATA_DIR = get_data_dir()
_DEFAULT_DB = (_DATA_DIR / "data" / "focus_filter.db").as_posix()
_DEFAULT_RULES = get_bundled_resource("rules/default_rules.yaml").as_posix()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_DATA_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────
    app_env: str = "dev"
    app_host: str = "127.0.0.1"
    app_port: int = 8787
    app_log_level: str = "INFO"

    # ── Database ─────────────────────────────────────────────────────────
    db_url: str = f"sqlite:///{_DEFAULT_DB}"

    # ── Rule engine ──────────────────────────────────────────────────────
    rules_path: str = _DEFAULT_RULES

    # ── UI / CORS ────────────────────────────────────────────────────────
    ui_origin: str = "http://localhost:1420"

    # ── Telegram ─────────────────────────────────────────────────────────
    tg_api_id: str = ""
    tg_api_hash: str = ""
    tg_phone: str = ""
    tg_session_name: str = "user"
    # Primary mention handle (legacy, single). Use tg_mention_handles for multiple.
    tg_mention_handle: str = ""
    # Comma-separated mention handles e.g. "@alice,@bob" — overrides tg_mention_handle when set
    tg_mention_handles: str = ""
    tg_monitored_chat_ids: str = ""
    tg_monitored_thread_ids: str = ""
    # Context lift mode for short ping-replies:
    # when enabled, task text/reply target may be inherited from parent message.
    tg_context_lift_enabled: bool = False

    # ── Reactions & reply ────────────────────────────────────────────────
    # Must be a valid Telegram reaction emoji (👍 ❤ 🔥 ✍ 👏 🎉 etc.)
    # ✅ is NOT supported by Telegram — use 👍 or another valid emoji.
    done_reaction: str = "👍"
    done_send_reply: bool = True
    done_reply_text: str = "Готово ✅"

    # When True, send done_reaction on task completion (default: True).
    done_reaction_enabled: bool = True

    # When True and a custom reply is provided, also send custom_reply_reaction
    # on the source message (in addition to the reply text).
    custom_reply_reaction_enabled: bool = False

    # Emoji to use as reaction when a custom reply is sent.
    # Empty string = use done_reaction as fallback.
    custom_reply_reaction: str = ""

    # ── Staged-commit window ─────────────────────────────────────────────
    done_commit_delay_seconds: int = 5

    # ── Noise filters ────────────────────────────────────────────────────
    filter_ignore_own: bool = True          # skip outgoing messages (msg.out)
    filter_min_text_length: int = 0         # min chars required to create a task
    filter_strict_mentions: bool = True     # hard-locked: only create tasks for msgs with @mention

    # ── Auto-cleanup ─────────────────────────────────────────────────────
    cleanup_done_after_days: int = 0        # 0 = disabled

    # ── Catch-up scan on startup ──────────────────────────────────────────
    # Scans message history on startup to catch messages received while offline.
    # catchup_enabled=False → auto-scan skipped on startup (manual scan still works).
    # catchup_hours: how many hours back to scan (0 also disables).
    # Messages that already have our reaction are created as status=done (not inbox).
    catchup_enabled: bool = False
    catchup_hours: int = 8

    # ── UI preferences ───────────────────────────────────────────────────
    notifications_enabled: bool = True  # show OS toast notifications
    sound_enabled: bool = True          # play sound in notifications
    notification_sound: str = "ding"    # sound preset: ding | double | chime | pop | ping
    compact_mode: bool = False  # legacy — kept for backward compat
    # task_display_mode: "compact" | "standard" | "expanded"
    # If not set, falls back to compact_mode for backward compat.
    task_display_mode: str = ""

    # ── Inbox sort order ──────────────────────────────────────────────────
    # tasks_inbox_sort_direction: "desc" = newest first (default), "asc" = oldest first
    tasks_inbox_sort_direction: str = "desc"
    # tasks_inbox_sort_by_priority: when True, priority is applied before date sort
    tasks_inbox_sort_by_priority: bool = False

    # ── Helpers ──────────────────────────────────────────────────────────

    def get_mention_handles(self) -> list[str]:
        """Return normalised list of mention handles to watch."""
        raw = self.tg_mention_handles.strip() or self.tg_mention_handle.strip()
        return [h.strip() for h in raw.split(",") if h.strip()]

    @field_validator("filter_strict_mentions", mode="before")
    @classmethod
    def _force_strict_mentions(cls, _v):
        """Hard-lock strict mention mode regardless of .env/API input."""
        return True


@lru_cache
def get_settings() -> Settings:
    """Return singleton Settings — safe for FastAPI DI and testing.

    Loads DPAPI-encrypted secrets into os.environ before constructing Settings
    so that pydantic-settings picks them up (env vars take priority over .env).
    """
    # Inject DPAPI secrets into os.environ first (non-fatal, Windows-only)
    try:
        from .services.dpapi_service import inject_secrets_into_env
        inject_secrets_into_env()
    except Exception:
        pass
    return Settings()


def save_tg_credentials(api_id: int, api_hash: str, phone: str) -> None:
    """Persist TG credentials so they survive backend restarts.

    Strategy:
      - TG_API_ID and TG_API_HASH → Windows DPAPI encrypted blob (secrets.dpapi)
        if DPAPI is available; plaintext .env otherwise (backward-compatible).
      - TG_PHONE → always written to .env (not secret, needed for setup wizard).

    After saving, clears lru_cache so get_settings() reloads from disk/DPAPI.
    """
    from dotenv import set_key, unset_key

    env_path = str(_DATA_DIR / ".env")

    # Always persist phone to .env (not sensitive)
    set_key(env_path, "TG_PHONE", phone)

    try:
        from .services.dpapi_service import is_dpapi_available, save_secrets

        if is_dpapi_available():
            # Save API credentials to DPAPI
            save_secrets({"TG_API_ID": str(api_id), "TG_API_HASH": api_hash})

            # Remove from .env (DPAPI is now the source of truth)
            unset_key(env_path, "TG_API_ID")
            unset_key(env_path, "TG_API_HASH")

            # Inject into os.environ immediately so Settings() picks them up
            import os as _os
            _os.environ["TG_API_ID"] = str(api_id)
            _os.environ["TG_API_HASH"] = api_hash

        else:
            # Fallback: plaintext .env (non-Windows / CI)
            set_key(env_path, "TG_API_ID", str(api_id))
            set_key(env_path, "TG_API_HASH", api_hash)

    except Exception as exc:
        # Non-fatal: fall back to plaintext .env
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "DPAPI unavailable for save_tg_credentials — using .env fallback: %s", exc
        )
        set_key(env_path, "TG_API_ID", str(api_id))
        set_key(env_path, "TG_API_HASH", api_hash)

    # Reset cache so next call to get_settings() reads updated env/DPAPI
    get_settings.cache_clear()


def save_settings(updates: dict) -> None:
    """Persist arbitrary settings to .env and clear the lru_cache."""
    from dotenv import set_key

    env_path = str(_DATA_DIR / ".env")
    for key, value in updates.items():
        set_key(env_path, key.upper(), str(value))
    get_settings.cache_clear()
