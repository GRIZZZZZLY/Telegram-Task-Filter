/**
 * useBackendReady — polls GET /health until the backend responds.
 *
 * Returns { ready, elapsed, timedOut } where:
 *   ready    — true once /health returns 200
 *   elapsed  — seconds since hook mounted
 *   timedOut — true after TIMEOUT_S seconds without a response
 *
 * Used by AppShell to show a connecting screen instead of crashing
 * when the React app loads before the Python backend is up.
 *
 * NOTE: fetch() from Electron renderer (file:// origin) requires the
 * backend to allow Origin: null via CORS — see main.py allow_origins=["*"].
 */
import { useEffect, useRef, useState } from 'react'

const HEALTH_URL = 'http://localhost:8787/health'
const POLL_MS    = 400
const TIMEOUT_S  = 40

export function useBackendReady() {
  const [ready,    setReady]    = useState(false)
  const [elapsed,  setElapsed]  = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const startRef  = useRef(Date.now())
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled) return

      const elapsedNow = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsed(elapsedNow)

      if (elapsedNow >= TIMEOUT_S) {
        setTimedOut(true)
        return
      }

      try {
        const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(800) })
        if (res.ok && !cancelled) {
          setReady(true)
          return
        }
      } catch {
        // backend not up yet — keep polling
      }

      if (!cancelled) {
        timerRef.current = setTimeout(tick, POLL_MS)
      }
    }

    void tick()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { ready, elapsed, timedOut }
}
