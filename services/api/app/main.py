"""FastAPI application entry point.

Startup sequence (lifespan):
  1. Create DB tables
  2. Start TelegramService (connect to Telegram via saved session)
  3. Register Telethon message listener
  4. Run catch-up scan (background task — picks up messages missed while offline)
  5. Start staged-commit background worker
  6. Start reaction-guard background worker (auto-rollback safety)

Shutdown sequence:
  1. Cancel commit worker task
  2. Stop TelegramService (disconnect from Telegram)
"""
import asyncio
import logging
import logging.handlers
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# ── Root logging setup ────────────────────────────────────────────────────────
# Must run before any logger.info() calls in the app.
# basicConfig is a no-op if handlers already exist, so safe to call here.
from .tz import MskFormatter as _MskFormatter
_fmt = _MskFormatter("%(asctime)s MSK %(levelname)-8s %(name)s | %(message)s")

_root = logging.getLogger()
if not _root.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(_fmt)
    _root.addHandler(_handler)
_root.setLevel(logging.INFO)

# ── File logging (always on — helps debug packaged builds) ─────────────────
try:
    from .path_utils import get_data_dir as _get_data_dir
    _log_dir: Path = _get_data_dir() / "logs"
    _log_dir.mkdir(parents=True, exist_ok=True)
    _file_handler = logging.handlers.RotatingFileHandler(
        _log_dir / "backend.log",
        maxBytes=5 * 1024 * 1024,  # 5 MB per file
        backupCount=3,
        encoding="utf-8",
    )
    _file_handler.setFormatter(_fmt)
    _root.addHandler(_file_handler)
except Exception as _e:
    # Non-fatal: if we can't set up file logging, stdout is still active
    print(f"[logging] Could not set up file handler: {_e}", file=sys.stderr)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import create_tables
from .middleware.pin_auth import PinAuthMiddleware
from .services.ntfs_service import harden_data_dir
from .path_utils import get_data_dir
from .routers import auth, tasks, ws
from .routers.logs import router as logs_router
from .routers.pin import router as pin_router
from .routers.settings import router as settings_router
from .routers.stats import router as stats_router
from .routers.telegram_info import router as telegram_info_router
from .services.notification_service import manager as ws_manager
from .services.telegram_service import TelegramService
from .workers.catchup_worker import run_catchup
from .workers.cleanup_worker import cleanup_worker
from .workers.commit_worker import run_commit_worker
from .workers.reaction_guard_worker import run_reaction_guard_worker
from .workers.snooze_worker import run_snooze_worker
from .workers.tg_listener import start_listener

logger = logging.getLogger(__name__)
settings = get_settings()

# Silence noisy third-party loggers
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
logging.getLogger("telethon").setLevel(logging.ERROR)
logging.getLogger("watchfiles").setLevel(logging.WARNING)

_catchup_task: asyncio.Task | None = None
_commit_worker_task: asyncio.Task | None = None
_snooze_worker_task: asyncio.Task | None = None
_cleanup_worker_task: asyncio.Task | None = None
_reaction_guard_worker_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _catchup_task, _commit_worker_task, _snooze_worker_task, _cleanup_worker_task, _reaction_guard_worker_task

    # ── Startup ───────────────────────────────────────────────────────────
    logger.info("Starting up | env=%s", settings.app_env)

    # Harden AppData directory permissions (Windows NTFS, non-fatal)
    harden_data_dir(get_data_dir())

    create_tables()

    await TelegramService.start()
    await start_listener()

    # Run catch-up scan in background — don't block startup
    _catchup_task = asyncio.create_task(run_catchup(), name="catchup_worker")

    _commit_worker_task = asyncio.create_task(
        run_commit_worker(settings.done_commit_delay_seconds),
        name="commit_worker",
    )
    _snooze_worker_task = asyncio.create_task(
        run_snooze_worker(interval_seconds=30),
        name="snooze_worker",
    )
    _cleanup_worker_task = asyncio.create_task(
        cleanup_worker(),
        name="cleanup_worker",
    )
    _reaction_guard_worker_task = asyncio.create_task(
        run_reaction_guard_worker(),
        name="reaction_guard_worker",
    )
    logger.info("All components started")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    logger.info("Shutting down")

    for task in (_catchup_task, _commit_worker_task, _snooze_worker_task, _cleanup_worker_task, _reaction_guard_worker_task):
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    await TelegramService.stop()
    logger.info("Shutdown complete")


app = FastAPI(
    title="TG Focus Filter API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Restrict to known origins:
    #   "null"                   — Electron renderer loading from file:// (production)
    #   "http://localhost:5173"  — Vite dev server (development)
    # This prevents malicious websites from making cross-origin requests to the
    # local API, even though it only listens on localhost.
    allow_origins=["null", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PIN-based auth middleware — blocks all requests (except whitelist) when PIN is set.
# Added after CORS so preflight OPTIONS requests are handled first.
app.add_middleware(PinAuthMiddleware)

app.include_router(pin_router)
app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(ws.router)
app.include_router(settings_router)
app.include_router(telegram_info_router)
app.include_router(logs_router)
app.include_router(stats_router)


@app.get("/health", tags=["meta"])
def health():
    """Health check — returns status of all components."""
    return {
        "ok": True,
        "env": settings.app_env,
        "telegram_connected": TelegramService.is_available(),
        "ws_clients": ws_manager.connection_count,
    }
