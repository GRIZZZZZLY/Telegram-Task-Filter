"""Bearer-token authentication middleware.

When a PIN is configured, ALL API requests (except whitelisted paths)
must include `Authorization: Bearer <token>` header.

If no PIN is set → middleware is transparent (all requests pass through).
This ensures backward compatibility with first-run / Setup Wizard flow.

WebSocket upgrade requests are also checked — the token is passed as
a query parameter: `ws://localhost:8787/ws/tasks?token=<token>`.
"""
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from ..services.pin_service import is_pin_set, verify_token

logger = logging.getLogger(__name__)

# Paths that never require authentication.
# Prefix match: "/auth/pin/status" matches "/auth/pin/status".
_WHITELIST_PREFIXES = (
    "/health",
    "/auth/pin/",     # PIN management endpoints (set, verify, status)
    "/docs",          # Swagger UI (dev only)
    "/openapi.json",  # OpenAPI schema (dev only)
)

# Exact paths (not prefix)
_WHITELIST_EXACT = {
    "/auth/pin/status",
}


def _is_whitelisted(path: str) -> bool:
    """Check if the request path is exempt from auth."""
    if path in _WHITELIST_EXACT:
        return True
    for prefix in _WHITELIST_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


class PinAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Always allow CORS preflight requests.
        # CORSMiddleware will validate Origin and return 200/400 accordingly.
        if request.method.upper() == "OPTIONS":
            return await call_next(request)

        # If no PIN is set → pass everything through (first-run / no protection)
        if not is_pin_set():
            return await call_next(request)

        path = request.url.path

        # Whitelisted paths don't need auth
        if _is_whitelisted(path):
            return await call_next(request)

        # WebSocket: token in query param
        if path.startswith("/ws/"):
            token = request.query_params.get("token", "")
            if verify_token(token):
                return await call_next(request)
            return JSONResponse(
                status_code=401,
                content={"detail": "Требуется авторизация (PIN)"},
            )

        # Regular HTTP: Bearer token in Authorization header
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            if verify_token(token):
                return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={"detail": "Требуется авторизация (PIN)"},
        )
