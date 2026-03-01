/**
 * PIN guard hook — manages authentication state and auto-lock timer.
 *
 * State machine:
 *   loading → (check backend) → needsSetup | locked | unlocked
 *   unlocked → (idle timeout) → locked
 *   locked → (verify PIN) → unlocked
 *
 * Token is stored in memory only (never localStorage) — lost on page reload.
 * This is intentional: reload = re-enter PIN.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPinStatus } from '@/api/pin'
import { setAuthToken } from '@/api/client'

export type PinState = 'loading' | 'no-pin' | 'needs-setup' | 'locked' | 'unlocked'

// ── Auto-lock timeout (persisted in localStorage) ────────────────────────────

const LOCK_TIMEOUT_KEY = 'tgff_lock_timeout_min'
const DEFAULT_LOCK_MINUTES = 5

export function getLockTimeoutMinutes(): number {
  const raw = localStorage.getItem(LOCK_TIMEOUT_KEY)
  if (raw) {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 0) return n
  }
  return DEFAULT_LOCK_MINUTES
}

export function setLockTimeoutMinutes(minutes: number): void {
  localStorage.setItem(LOCK_TIMEOUT_KEY, String(Math.max(0, Math.round(minutes))))
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePinGuardResult {
  state: PinState
  pinSet: boolean
  unlock: (token: string) => void
  lock: () => void
  skipSetup: () => void
  /** Call after PIN is set/changed/removed from Settings to re-check state */
  recheckPin: () => void
}

export function usePinGuard(): UsePinGuardResult {
  const [state, setState] = useState<PinState>('loading')
  const [pinSet, setPinSet] = useState(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokenRef = useRef<string | null>(null)

  const checkPinStatus = useCallback(() => {
    getPinStatus()
      .then((status) => {
        setPinSet(status.pin_set)
        if (status.pin_set) {
          // Only lock if not already unlocked (don't re-lock on recheck)
          setState((prev) => prev === 'unlocked' ? prev : 'locked')
        } else {
          setState((prev) => {
            // First load: offer setup. After removal: no-pin.
            if (prev === 'loading') return 'needs-setup'
            return 'no-pin'
          })
        }
      })
      .catch(() => {
        setState('no-pin')
      })
  }, [])

  // Check PIN status on mount
  useEffect(() => {
    checkPinStatus()
  }, [checkPinStatus])

  // Reset idle timer on any user activity
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    if (state !== 'unlocked') return

    const minutes = getLockTimeoutMinutes()
    if (minutes <= 0) return // 0 = disabled

    idleTimerRef.current = setTimeout(() => {
      tokenRef.current = null
      setAuthToken(null)
      setState('locked')
    }, minutes * 60 * 1000)
  }, [state])

  // Attach activity listeners when unlocked
  useEffect(() => {
    if (state !== 'unlocked') return

    const events = ['mousedown', 'keydown', 'mousemove', 'touchstart', 'scroll'] as const
    const handler = () => resetIdleTimer()

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
    resetIdleTimer()

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler))
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [state, resetIdleTimer])

  const unlock = useCallback((token: string) => {
    tokenRef.current = token
    setAuthToken(token)
    setPinSet(true)
    setState('unlocked')
  }, [])

  const lock = useCallback(() => {
    tokenRef.current = null
    setAuthToken(null)
    setState('locked')
  }, [])

  const skipSetup = useCallback(() => {
    setState('no-pin')
  }, [])

  return { state, pinSet, unlock, lock, skipSetup, recheckPin: checkPinStatus }
}
