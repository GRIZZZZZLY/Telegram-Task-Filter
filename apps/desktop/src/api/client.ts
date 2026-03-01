const BASE_URL = 'http://localhost:8787'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── Bearer token management ──────────────────────────────────────────────────
// Token is stored in memory only (never localStorage).
// Set by usePinGuard after successful PIN verification.

let _authToken: string | null = null

export function setAuthToken(token: string | null): void {
  _authToken = token
}

export function getAuthToken(): string | null {
  return _authToken
}

// ── API fetch with auto-auth ─────────────────────────────────────────────────

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase()
  const hasBody = options?.body !== undefined

  // Don't send Content-Type on GET/HEAD requests — they have no body and the
  // header triggers a CORS preflight (OPTIONS) which can fail when the Electron
  // renderer loads from file:// (Origin: null).  POST/PATCH/DELETE with a body
  // still need it.
  const extraHeaders: Record<string, string> =
    hasBody || (method !== 'GET' && method !== 'HEAD')
      ? { 'Content-Type': 'application/json' }
      : {}

  // Attach Bearer token if available
  if (_authToken) {
    extraHeaders['Authorization'] = `Bearer ${_authToken}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    // headers must come AFTER ...options so the merged Authorization header wins
    // over any partial headers passed by the caller
    headers: { ...extraHeaders, ...(options?.headers as Record<string, string> | undefined) },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }

  return res.json() as Promise<T>
}

// ── WebSocket URL with token ─────────────────────────────────────────────────

export function getWsUrl(): string {
  const base = 'ws://localhost:8787/ws/tasks'
  return _authToken ? `${base}?token=${_authToken}` : base
}

/** @deprecated Use getWsUrl() for token-aware connections */
export const WS_URL = 'ws://localhost:8787/ws/tasks'
