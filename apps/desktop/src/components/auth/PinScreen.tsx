/**
 * PIN entry screen — shown when PIN is configured and user is not authenticated.
 *
 * Features:
 *  - 6 dot indicators showing entered digits
 *  - Numeric keypad (1-9, 0, backspace)
 *  - Shake animation on wrong PIN
 *  - Lockout countdown after too many failures
 *  - Also used for first-time PIN setup (mode="setup")
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { TgWindowFrame } from '@/components/tg'
import { Delete, Lock, ShieldCheck } from 'lucide-react'
import { verifyPin, setPin as apiSetPin } from '@/api/pin'
import { cn } from '@/lib/utils'
import { TG_MS } from '@/lib/tg-motion'

interface Props {
  mode: 'unlock' | 'setup'
  onUnlocked: (token: string) => void
  onSkipSetup?: () => void
}

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

export function PinScreen({ mode, onUnlocked, onSkipSetup }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lockSeconds, setLockSeconds] = useState(0)

  // Setup mode: two-step (enter → confirm)
  const [setupStep, setSetupStep] = useState<'enter' | 'confirm'>('enter')
  const [setupPin, setSetupPin] = useState('')

  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Lockout countdown
  useEffect(() => {
    if (lockSeconds <= 0) return
    lockTimerRef.current = setInterval(() => {
      setLockSeconds((s) => {
        if (s <= 1) {
          if (lockTimerRef.current) clearInterval(lockTimerRef.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current)
    }
  }, [lockSeconds > 0])

  const triggerShake = useCallback(() => {
    setShake(true)
    setTimeout(() => setShake(false), TG_MS.shake)
  }, [])

  const handleSubmitUnlock = useCallback(async (fullPin: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await verifyPin(fullPin)
      if (result.success && result.token) {
        onUnlocked(result.token)
      } else {
        triggerShake()
        if (result.locked) {
          setLockSeconds(result.remaining_seconds)
          setError(`Слишком много попыток. Подождите ${result.remaining_seconds}с`)
        } else {
          setError('Неверный PIN')
        }
        setPin('')
      }
    } catch {
      triggerShake()
      setError('Ошибка соединения')
      setPin('')
    } finally {
      setLoading(false)
    }
  }, [onUnlocked, triggerShake])

  const handleSubmitSetup = useCallback(async (fullPin: string) => {
    if (setupStep === 'enter') {
      setSetupPin(fullPin)
      setSetupStep('confirm')
      setPin('')
      return
    }

    // Confirm step
    if (fullPin !== setupPin) {
      triggerShake()
      setError('PIN не совпадает. Попробуйте снова')
      setSetupStep('enter')
      setSetupPin('')
      setPin('')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await apiSetPin(fullPin)
      if (result.ok && result.token) {
        onUnlocked(result.token)
      } else {
        setError('Ошибка установки PIN')
        setSetupStep('enter')
        setSetupPin('')
        setPin('')
      }
    } catch {
      setError('Ошибка соединения')
      setSetupStep('enter')
      setSetupPin('')
      setPin('')
    } finally {
      setLoading(false)
    }
  }, [setupStep, setupPin, onUnlocked, triggerShake])

  const handleKey = useCallback((key: string) => {
    if (loading || lockSeconds > 0) return

    if (key === 'del') {
      setPin((p) => p.slice(0, -1))
      setError('')
      return
    }

    if (key === '') return

    setPin((prev) => {
      const next = prev + key
      if (next.length >= PIN_LENGTH) {
        // Auto-submit when full
        setTimeout(() => {
          if (mode === 'unlock') {
            void handleSubmitUnlock(next)
          } else {
            void handleSubmitSetup(next)
          }
        }, 100)
      }
      return next.slice(0, PIN_LENGTH)
    })
    setError('')
  }, [loading, lockSeconds, mode, handleSubmitUnlock, handleSubmitSetup])

  // Keyboard input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key)
      else if (e.key === 'Backspace') handleKey('del')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey])

  const title = mode === 'setup'
    ? setupStep === 'enter' ? 'Установите PIN-код' : 'Повторите PIN-код'
    : 'Введите PIN-код'

  const subtitle = mode === 'setup'
    ? setupStep === 'enter'
      ? 'PIN защитит доступ к приложению и Telegram-сессии'
      : 'Введите тот же PIN ещё раз для подтверждения'
    : 'Для доступа к приложению'

  return (
    <TgWindowFrame className="items-center justify-center">
      <div className="flex flex-col items-center gap-6 px-8">
        {/* Icon */}
        <div className="grid h-16 w-16 place-items-center rounded-full bg-tg-accent/15 text-tg-accent-text">
          {mode === 'setup' ? <ShieldCheck size={32} /> : <Lock size={32} />}
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-lg font-semibold text-tg-text-bold">{title}</h1>
          <p className="mt-1 text-tg-sm text-tg-text-sub">{subtitle}</p>
        </div>

        {/* Dots */}
        <div
          className={cn(
            'flex gap-3',
            shake && 'animate-[tg-shake_300ms_ease-in-out]',
          )}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-3.5 w-3.5 rounded-full border-2 transition-all duration-tg-universal',
                i < pin.length
                  ? 'scale-110 border-tg-accent bg-tg-accent'
                  : 'border-tg-checkbox-off bg-transparent',
              )}
            />
          ))}
        </div>

        {/* Error / lockout */}
        <div className="h-5 text-center">
          {lockSeconds > 0 ? (
            <p className="text-tg-sm text-tg-danger">
              Заблокировано на {lockSeconds}с
            </p>
          ) : error ? (
            <p className="text-tg-sm text-tg-danger">{error}</p>
          ) : null}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, i) => {
            if (key === '') return <div key={i} />
            const isDelete = key === 'del'
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleKey(key)}
                disabled={loading || lockSeconds > 0}
                aria-label={isDelete ? 'Стереть' : key}
                className={cn(
                  'grid h-14 w-14 place-items-center rounded-full text-lg font-medium',
                  'transition-colors duration-tg-universal',
                  'hover:bg-tg-bg-over active:bg-tg-bg-ripple',
                  'disabled:cursor-not-allowed disabled:opacity-30',
                  isDelete ? 'text-tg-text-sub' : 'text-tg-text',
                )}
              >
                {isDelete ? <Delete size={20} /> : key}
              </button>
            )
          })}
        </div>

        {/* Skip setup (optional) */}
        {mode === 'setup' && onSkipSetup && (
          <button
            type="button"
            onClick={onSkipSetup}
            className="text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:text-tg-text"
          >
            Пропустить (не рекомендуется)
          </button>
        )}
      </div>
    </TgWindowFrame>
  )
}
