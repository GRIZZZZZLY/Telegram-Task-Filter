/**
 * PIN authentication API client.
 *
 * These endpoints are whitelisted in the backend middleware —
 * they work WITHOUT a Bearer token (chicken-and-egg: need PIN to get token).
 */

const BASE_URL = 'http://localhost:8787'

export interface PinStatus {
  pin_set: boolean
  locked: boolean
  remaining_seconds: number
  failed_attempts: number
  max_attempts: number
}

export interface PinVerifyResult {
  success: boolean
  token: string | null
  locked: boolean
  remaining_seconds: number
}

export interface PinSetResult {
  ok: boolean
  token: string | null
}

async function pinFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body)
  }
  return res.json() as Promise<T>
}

export function getPinStatus(): Promise<PinStatus> {
  return pinFetch<PinStatus>('/auth/pin/status')
}

export function verifyPin(pin: string): Promise<PinVerifyResult> {
  return pinFetch<PinVerifyResult>('/auth/pin/verify', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  })
}

export function setPin(pin: string, currentPin?: string): Promise<PinSetResult> {
  return pinFetch<PinSetResult>('/auth/pin/set', {
    method: 'POST',
    body: JSON.stringify({ pin, current_pin: currentPin ?? null }),
  })
}
