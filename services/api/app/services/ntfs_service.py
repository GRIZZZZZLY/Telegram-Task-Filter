"""NTFS permission hardening for the AppData directory.

Restricts the application data directory so that only the current Windows
user (and SYSTEM/Administrators via ownership) can read or write it.
This prevents other local users or low-privilege processes from reading
sensitive files (.env, pin.json, sessions/).

Only runs on Windows (no-op on other platforms).
Non-fatal: any failure is logged as a warning and the app continues.

Usage:
    from .services.ntfs_service import harden_data_dir
    harden_data_dir(get_data_dir())
"""
import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def harden_data_dir(path: Path) -> None:
    """Apply restrictive NTFS ACL to the given directory (Windows only).

    Removes inherited permissions and grants full control exclusively to
    the current user. SYSTEM and Administrators retain access via
    OS-level ownership — this cannot be blocked.

    Args:
        path: Directory to protect (e.g. AppData/Roaming/tg-focus-filter-desktop).

    Returns:
        None. Logs result; never raises.
    """
    if os.name != "nt":
        logger.debug("NTFS hardening skipped — not Windows")
        return

    username = os.environ.get("USERNAME", "").strip()
    if not username:
        logger.warning("NTFS hardening skipped — USERNAME env var not set")
        return

    if not path.exists():
        logger.debug("NTFS hardening skipped — directory does not exist yet: %s", path)
        return

    try:
        result = subprocess.run(
            [
                "icacls",
                str(path),
                "/inheritance:r",          # remove inherited ACEs
                "/grant:r",                # replace (not add) explicit ACE
                f"{username}:(OI)(CI)F",  # current user: full control, all subfolders/files
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

        if result.returncode == 0:
            logger.info("NTFS permissions hardened: %s (user=%s)", path, username)
        else:
            logger.warning(
                "NTFS hardening returned non-zero (%d): %s",
                result.returncode,
                result.stderr.strip() or result.stdout.strip(),
            )

    except FileNotFoundError:
        logger.warning("NTFS hardening skipped — icacls not found (non-standard Windows?)")
    except subprocess.TimeoutExpired:
        logger.warning("NTFS hardening timed out")
    except Exception as exc:
        logger.warning("NTFS hardening failed: %s", exc)


def get_current_acl(path: Path) -> str:
    """Return current ACL string for the path (diagnostic / testing helper).

    Returns empty string on any error.
    """
    if os.name != "nt":
        return ""
    try:
        result = subprocess.run(
            ["icacls", str(path)],
            capture_output=True, text=True, timeout=10, check=False,
        )
        return result.stdout.strip()
    except Exception:
        return ""
