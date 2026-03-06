"""Shared timezone constants and logging formatters for the project.

All internal storage uses UTC (timezone-naive for SQLite compatibility).
"""
import logging
from datetime import datetime, timezone, timedelta

#: Moscow Standard Time — UTC+3, no DST
MSK = timezone(timedelta(hours=3))


class MskFormatter(logging.Formatter):
    """Logging formatter that emits timestamps in Moscow time (UTC+3).

    Drop-in replacement for logging.Formatter — same arguments, same format
    string, but %(asctime)s shows MSK instead of the server's local time.
    Works on all platforms (unlike the TZ env var which is ignored on Windows).
    """

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        dt = datetime.fromtimestamp(record.created, tz=MSK)
        if datefmt:
            return dt.strftime(datefmt)
        # Match default logging format: "YYYY-MM-DD HH:MM:SS,mmm"
        return dt.strftime('%Y-%m-%d %H:%M:%S') + f',{int(record.msecs):03d}'


class UtcFormatter(logging.Formatter):
    """Logging formatter that emits timestamps in UTC.

    Keeps the same default timestamp shape as logging.Formatter:
    "YYYY-MM-DD HH:MM:SS,mmm"
    """

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        dt = datetime.fromtimestamp(record.created, tz=timezone.utc)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime('%Y-%m-%d %H:%M:%S') + f',{int(record.msecs):03d}'
