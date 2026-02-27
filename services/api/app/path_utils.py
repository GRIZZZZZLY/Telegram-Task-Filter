"""Centralised path resolution for both dev and packaged (PyInstaller) modes.

How paths work:

  Dev mode   (python -m uvicorn):
    APP_DATA_DIR env var is NOT set (or set to project root).
    All paths resolve to the project root — same as before.

  Packaged mode (backend.exe via PyInstaller + Electron):
    Electron sets APP_DATA_DIR = app.getPath('userData')
    e.g. C:\\Users\\Igor\\AppData\\Roaming\\TG Focus Filter\\
    All user data lives there; bundled resources come from sys._MEIPASS.

Usage:
    from .path_utils import get_data_dir, get_bundled_resource, get_sessions_dir
"""
import os
import sys
from pathlib import Path

# In dev, project root is 3 parents above app/ (services/api/app/path_utils.py)
_DEV_ROOT = Path(__file__).parents[3]


def get_data_dir() -> Path:
    """Return writable directory for user data (.env, sessions/, data/).

    In packaged mode: set by Electron via APP_DATA_DIR env var.
    In dev mode: falls back to project root (no behavioural change).
    """
    env = os.environ.get("APP_DATA_DIR")
    if env:
        return Path(env)
    return _DEV_ROOT


def get_sessions_dir() -> Path:
    """Return (and create) the sessions/ directory."""
    d = get_data_dir() / "sessions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_bundled_resource(relative: str) -> Path:
    """Resolve path to a read-only bundled resource (e.g. rules/default_rules.yaml).

    In packaged mode: resources are extracted to sys._MEIPASS by PyInstaller.
    In dev mode: relative to project root.
    """
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / relative
    return _DEV_ROOT / relative
