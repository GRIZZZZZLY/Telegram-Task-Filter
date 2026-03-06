"""Logs router — GET /logs

Returns the last N lines from backend.log for display in the Settings UI.
Supports optional level filtering (ERROR / WARNING / INFO).
"""
import logging
from collections import deque
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Query

from ..path_utils import get_data_dir

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/logs", tags=["logs"])

# Resolved at import time — same as the file handler in main.py
_LOG_FILE: Path = get_data_dir() / "logs" / "backend.log"

# Keywords that identify each level in the formatted log line.
# Format: "YYYY-MM-DD HH:MM:SS,mmm UTC LEVEL    name | message"
_LEVEL_KEYWORDS: dict[str, list[str]] = {
    "ERROR":   ["ERROR"],
    "WARNING": ["WARNING"],
    "INFO":    ["INFO"],
}


def _read_last_lines(path: Path, n: int) -> list[str]:
    """Read the last *n* non-empty lines from *path* efficiently."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return [line.rstrip("\n") for line in deque(fh, maxlen=n) if line.strip()]
    except FileNotFoundError:
        return []
    except OSError as exc:
        logger.warning("Could not read log file %s: %s", path, exc)
        return []


@router.get("")
def get_logs(
    lines: int = Query(default=200, ge=10, le=2000, description="Number of last lines"),
    level: Optional[str] = Query(default=None, description="Filter: ERROR | WARNING | INFO"),
) -> dict:
    """Return the last N lines from backend.log.

    When *level* is set, only lines that contain the corresponding keyword
    are returned (still capped at *lines* after filtering).

    Response: { lines: list[str], file: str, total_lines: int }
    """
    level_upper = level.upper() if level else None
    keywords = _LEVEL_KEYWORDS.get(level_upper, []) if level_upper else []

    # Read more raw lines than requested so filtering still yields `lines` results
    read_n = lines * 5 if keywords else lines
    raw = _read_last_lines(_LOG_FILE, read_n)

    if keywords:
        raw = [ln for ln in raw if any(kw in ln for kw in keywords)]

    # Keep only the last `lines` after optional filtering
    result = raw[-lines:] if len(raw) > lines else raw

    return {
        "lines": result,
        "file": _LOG_FILE.name,
        "total_lines": len(result),
    }
