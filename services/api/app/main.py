"""FastAPI application entry point.

Startup sequence (lifespan):
  1. Create DB tables
  2. Start TelegramService (connect to Telegram via saved session)
  3. Register Telethon message listener
  4. Start staged-commit background worker

Shutdown sequence:
  1. Cancel commit worker task
  2. Stop TelegramService (disconnect from Telegram)
"""
import asyncio
import logging
import sys
from contextlib import asynccontextmanager

# ── Root logging setup ────────────────────────────────────────────────────────
# Must run before any logger.info() calls in the app.
# basicConfig is a no-op if handlers already exist, so safe to call here.
_root = logging.getLogger()
if not _root.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-8s %(name)s | %(message)s")
    )
    _root.addHandler(_handler)
_root.setLevel(logging.INFO)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import create_tables
from .routers import auth, tasks, ws
from .routers.settings import router as settings_router
from .routers.telegram_info import router as telegram_info_router
from .services.notification_service import manager as ws_manager
from .services.telegram_service import TelegramService
from .workers.cleanup_worker import cleanup_worker
from .workers.commit_worker import run_commit_worker
from .workers.snooze_worker import run_snooze_worker
from .workers.tg_listener import start_listener

logger = logging.getLogger(__name__)
settings = get_settings()

# Silence noisy third-party loggers
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
logging.getLogger("telethon").setLevel(logging.ERROR)
logging.getLogger("watchfiles").setLevel(logging.WARNING)

_commit_worker_task: asyncio.Task | None = None
_snooze_worker_task: asyncio.Task | None = None
_cleanup_worker_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _commit_worker_task, _snooze_worker_task, _cleanup_worker_task

    # ── Startup ───────────────────────────────────────────────────────────
    logger.info("Starting up | env=%s", settings.app_env)

    create_tables()

    await TelegramService.start()
    await start_listener()

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
    logger.info("All components started")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    logger.info("Shutting down")

    for task in (_commit_worker_task, _snooze_worker_task, _cleanup_worker_task):
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
    # Allow all origins — this API is localhost-only (Electron renderer uses
    # Origin: null when loading from file://, which a whitelist would block).
    # No credentials (cookies) are used, so wildcard is safe here.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(ws.router)
app.include_router(settings_router)
app.include_router(telegram_info_router)


@app.get("/health", tags=["meta"])
def health():
    """Health check — returns status of all components."""
    return {
        "ok": True,
        "env": settings.app_env,
        "telegram_connected": TelegramService.is_available(),
        "ws_clients": ws_manager.connection_count,
    }
