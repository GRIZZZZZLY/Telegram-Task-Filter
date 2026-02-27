import { useCallback, useEffect, useState } from 'react'
import { getAuthStatus, authStart, authVerify } from '@/api/auth'

export type SetupStep = 'loading' | 'credentials' | 'otp' | 'done' | 'error'

const SETUP_KEY = 'tgff_setup_complete'

interface UseSetupResult {
  step: SetupStep
  hint: string
  error: string | null
  submitting: boolean
  startAuth: (params: { apiId: number; apiHash: string; phone: string }) => Promise<void>
  verifyOtp: (code: string, password?: string) => Promise<void>
  reset: () => void
}

export function useSetup(): UseSetupResult {
  const [step, setStep] = useState<SetupStep>('loading')
  const [hint, setHint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // On mount — check if already authenticated
  useEffect(() => {
    void (async () => {
      try {
        const status = await getAuthStatus()
        if (status.authenticated) {
          // Реально подключён — пропускаем wizard
          localStorage.setItem(SETUP_KEY, '1')
          setStep('done')
        } else {
          // session_exists но не authenticated = файл есть, но соединения нет
          // (невалидная сессия или бэкенд только стартовал) — показываем wizard
          setStep('credentials')
        }
      } catch {
        // Backend not running — still show main UI (offline mode)
        const done = localStorage.getItem(SETUP_KEY) === '1'
        setStep(done ? 'done' : 'credentials')
      }
    })()
  }, [])

  const startAuth = useCallback(
    async (params: { apiId: number; apiHash: string; phone: string }) => {
      setSubmitting(true)
      setError(null)
      try {
        const res = await authStart({
          api_id: params.apiId,
          api_hash: params.apiHash,
          phone: params.phone,
        })
        setHint(res.hint)
        setStep('otp')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка запроса кода')
      } finally {
        setSubmitting(false)
      }
    },
    [],
  )

  const verifyOtp = useCallback(async (code: string, password?: string) => {
    setSubmitting(true)
    setError(null)
    try {
      await authVerify({ code, password })
      localStorage.setItem(SETUP_KEY, '1')
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неверный код')
    } finally {
      setSubmitting(false)
    }
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(SETUP_KEY)
    setStep('credentials')
    setError(null)
    setHint('')
  }, [])

  return { step, hint, error, submitting, startAuth, verifyOtp, reset }
}
