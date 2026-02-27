import { apiFetch } from './client'

export interface AuthStatus {
  authenticated: boolean
  session_exists: boolean
  has_credentials: boolean
  username: string | null
}

export interface AuthStartResponse {
  status: string
  hint: string
}

export interface AuthVerifyResponse {
  status: string
  username: string | null
  first_name: string | null
}

export function getAuthStatus(): Promise<AuthStatus> {
  return apiFetch<AuthStatus>('/auth/status')
}

export function authStart(body: {
  api_id: number
  api_hash: string
  phone: string
}): Promise<AuthStartResponse> {
  return apiFetch<AuthStartResponse>('/auth/start', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function authVerify(body: {
  code: string
  password?: string
}): Promise<AuthVerifyResponse> {
  return apiFetch<AuthVerifyResponse>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
