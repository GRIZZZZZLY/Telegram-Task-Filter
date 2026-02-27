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

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...extraHeaders, ...(options?.headers as Record<string, string> | undefined) },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }

  return res.json() as Promise<T>
}

export const WS_URL = 'ws://localhost:8787/ws/tasks'
