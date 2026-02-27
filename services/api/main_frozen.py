"""PyInstaller entry point for the FastAPI backend.

Imports the ASGI app directly and runs uvicorn programmatically so that
PyInstaller can resolve all dependencies at bundle time (string-based
module loading used by `uvicorn app.main:app` syntax would bypass analysis).

Usage (dev — not needed normally):
    python main_frozen.py

Packaged (via PyInstaller):
    backend.exe   # spawned by Electron with APP_DATA_DIR env var
"""
import uvicorn

from app.main import app  # noqa: F401 — triggers PyInstaller dependency collection

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8787,
        log_level="info",
        # Never use reload in packaged mode — PyInstaller doesn't support it
        reload=False,
    )
