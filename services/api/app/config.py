"""Application settings via pydantic-settings.

In dev:      reads .env from the project root (resolved via __file__).
In packaged: reads .env from APP_DATA_DIR set by Electron (user's AppData folder).
             Bundled read-only resources (rules.yaml) come from sys._MEIPASS.
"""
from functools import lru_cache
from pathlib import Path

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
    app_secret_key: str = "change_me"

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
    tg_mention_handle: str = "@igo_kravts"
    # Comma-separated mention handles e.g. "@alice,@bob" — overrides tg_mention_handle when set
    tg_mention_handles: str = ""
    tg_monitored_chat_ids: str = ""
    tg_monitored_thread_ids: str = ""

    # ── Reactions & reply ────────────────────────────────────────────────
    # Must be a valid Telegram reaction emoji (👍 ❤ 🔥 ✍ 👏 🎉 etc.)
    # ✅ is NOT supported by Telegram — use 👍 or another valid emoji.
    done_reaction: str = "👍"
    done_send_reply: bool = True
    done_reply_text: str = "Готово ✅"

    # ── Staged-commit window ─────────────────────────────────────────────
    done_commit_delay_seconds: int = 5

    # ── Noise filters ────────────────────────────────────────────────────
    filter_ignore_own: bool = True          # skip outgoing messages (msg.out)
    filter_min_text_length: int = 0         # min chars required to create a task
    filter_strict_mentions: bool = False    # only create tasks for msgs with @mention

    # ── Auto-cleanup ─────────────────────────────────────────────────────
    cleanup_done_after_days: int = 0        # 0 = disabled

    # ── UI preferences ───────────────────────────────────────────────────
    sound_enabled: bool = True
    compact_mode: bool = False

    # ── Helpers ──────────────────────────────────────────────────────────

    def get_mention_handles(self) -> list[str]:
        """Return normalised list of mention handles to watch."""
        raw = self.tg_mention_handles.strip() or self.tg_mention_handle.strip()
        return [h.strip() for h in raw.split(",") if h.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return singleton Settings — safe for FastAPI DI and testing."""
    return Settings()


def save_tg_credentials(api_id: int, api_hash: str, phone: str) -> None:
    """Write TG credentials to .env so they persist across restarts.

    Uses python-dotenv's set_key (installed as a pydantic-settings dependency).
    After writing, clears the lru_cache so get_settings() reloads from disk.
    """
    from dotenv import set_key

    env_path = str(_DATA_DIR / ".env")
    set_key(env_path, "TG_API_ID", str(api_id))
    set_key(env_path, "TG_API_HASH", api_hash)
    set_key(env_path, "TG_PHONE", phone)
    # Reset cache so next call to get_settings() reads updated .env
    get_settings.cache_clear()


def save_settings(updates: dict) -> None:
    """Persist arbitrary settings to .env and clear the lru_cache."""
    from dotenv import set_key

    env_path = str(_DATA_DIR / ".env")
    for key, value in updates.items():
        set_key(env_path, key.upper(), str(value))
    get_settings.cache_clear()
