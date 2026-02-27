/**
 * TelegramAuthScreen — shown when the app starts but Telegram is not authorized.
 *
 * Three-step flow:
 *   Step 1 — enter API credentials (api_id, api_hash) + phone number
 *   Step 2 — enter the verification code sent to Telegram (+ 2FA if required)
 *   Step 3 — success screen showing connected username
 *
 * API credentials are saved to .env on step 1, so they persist across restarts.
 * If credentials are already set (has_credentials=true), the fields are still
 * shown but pre-labelled as "уже настроены" so the user can skip re-entering them.
 */
import { useState } from 'react'
import { Loader2, MessageCircle, CheckCircle2, ExternalLink, Lock } from 'lucide-react'
import { authStart, authVerify } from '@/api/auth'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'

interface Props {
  hasCredentials: boolean
  onConnected: (username: string) => void
}

type Step = 'credentials' | 'code' | 'success'

export function TelegramAuthScreen({ hasCredentials, onConnected }: Props) {
  // Step 1 fields
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')

  // Step 2 fields
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [needs2fa, setNeeds2fa] = useState(false)

  // UI state
  const [step, setStep] = useState<Step>('credentials')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedAs, setConnectedAs] = useState('')

  // ── Step 1: send code ──────────────────────────────────────────────────────

  const handleSendCode = async () => {
    setError(null)

    // If credentials are already configured, api_id/api_hash can be placeholders;
    // the backend will use the .env values. But if not set, user must fill them.
    const id = apiId.trim()
    const hash = apiHash.trim()

    if (!hasCredentials && (!id || !hash)) {
      setError('Введите API ID и API Hash от my.telegram.org')
      return
    }
    if (!phone.trim()) {
      setError('Введите номер телефона')
      return
    }

    setLoading(true)
    try {
      // Use entered values, or fall back to dummy (backend will use .env)
      await authStart({
        api_id: id ? Number(id) : 0,
        api_hash: hash || '_use_env_',
        phone: phone.trim(),
      })
      setStep('code')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Try to extract "detail" from JSON error body
      try {
        const parsed = JSON.parse(msg)
        setError(parsed.detail ?? msg)
      } catch {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: verify code ────────────────────────────────────────────────────

  const handleVerify = async () => {
    setError(null)
    if (!code.trim()) {
      setError('Введите код из Telegram')
      return
    }
    if (needs2fa && !password.trim()) {
      setError('Введите пароль 2FA')
      return
    }

    setLoading(true)
    try {
      const res = await authVerify({
        code: code.trim(),
        password: needs2fa ? password.trim() : undefined,
      })

      if (res.status === 'ok') {
        const name = res.username ? `@${res.username}` : (res.first_name ?? 'Пользователь')
        setConnectedAs(name)
        setStep('success')
        onConnected(name)
      } else {
        setError('Неожиданный ответ сервера')
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // 422 = backend signals 2FA is required — show password field, no error
        setNeeds2fa(true)
        setError(null)
      } else {
        // Any other error — extract human-readable detail
        const detail = err instanceof ApiError
          ? (() => { try { return (JSON.parse(err.message) as { detail?: string }).detail ?? err.message } catch { return err.message } })()
          : String(err)
        setError(detail)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col items-center justify-center gap-0 overflow-y-auto px-5 py-4">

      {/* Logo / title */}
      <div className="mb-5 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20">
          <MessageCircle className="h-6 w-6 text-indigo-400" />
        </div>
        <p className="text-base font-semibold text-foreground">Подключение Telegram</p>
        <p className="text-[12px] text-muted-foreground text-center leading-relaxed">
          {step === 'credentials' && 'Войдите в аккаунт, чтобы получать задачи из чатов'}
          {step === 'code' && !needs2fa && `Код отправлен в Telegram на ${phone}`}
          {step === 'code' && needs2fa && 'Требуется пароль двухфакторной аутентификации'}
          {step === 'success' && 'Telegram успешно подключён'}
        </p>
      </div>

      {/* ── Step indicator ──────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-center gap-2">
        {(['credentials', 'code', 'success'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
              step === s
                ? 'bg-indigo-500 text-white'
                : (step === 'success' || (step === 'code' && i === 0))
                  ? 'bg-indigo-500/30 text-indigo-400'
                  : 'bg-muted text-muted-foreground',
            )}>
              {i + 1}
            </div>
            {i < 2 && (
              <div className={cn(
                'h-px w-6 transition-colors',
                (step === 'code' && i === 0) || step === 'success'
                  ? 'bg-indigo-500/50'
                  : 'bg-border/50',
              )} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: credentials ─────────────────────────────────────────────── */}
      {step === 'credentials' && (
        <div className="flex w-full flex-col gap-3">
          {!hasCredentials && (
            <div className="rounded-xl border border-border/40 bg-card/60 p-3">
              <p className="mb-2 text-[12px] font-medium text-muted-foreground">
                API-ключи Telegram
              </p>
              <a
                href="https://my.telegram.org/apps"
                target="_blank"
                rel="noreferrer"
                className="mb-2.5 flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                onClick={(e) => {
                  e.preventDefault()
                  window.electronAPI?.openExternal('https://my.telegram.org/apps')
                }}
              >
                <ExternalLink className="h-3 w-3" />
                Получить на my.telegram.org → Apps
              </a>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">API ID</span>
                  <input
                    type="number"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                    placeholder="1234567"
                    className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">API Hash</span>
                  <input
                    type="text"
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    placeholder="a1b2c3d4e5f6..."
                    className="rounded-lg border border-border/50 bg-background px-3 py-1.5 font-mono text-[12px] outline-none focus:border-indigo-500"
                  />
                </label>
              </div>
            </div>
          )}

          {hasCredentials && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
              <p className="text-[11px] text-indigo-400">
                ✓ API-ключи уже настроены в .env — вводить повторно не нужно
              </p>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">Номер телефона</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSendCode()}
              placeholder="+79001234567"
              className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={() => void handleSendCode()}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отправить код'}
          </button>
        </div>
      )}

      {/* ── Step 2: verify code ──────────────────────────────────────────────── */}
      {step === 'code' && (
        <div className="flex w-full flex-col gap-3">

          {/* Code input — hidden once 2FA field is shown to reduce clutter */}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">Код из Telegram</span>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !needs2fa && void handleVerify()}
              placeholder="12345"
              autoFocus={!needs2fa}
              readOnly={needs2fa}
              className={cn(
                'rounded-lg border border-border/50 bg-background px-3 py-1.5 text-center text-[18px] font-mono tracking-widest outline-none focus:border-indigo-500',
                needs2fa && 'opacity-50',
              )}
            />
          </label>

          {/* 2FA hint — shown before the user submits the code */}
          {!needs2fa && (
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              💡 Если на аккаунте установлён пароль двухфакторной аутентификации (2FA),
              он потребуется после ввода кода.
            </p>
          )}

          {/* 2FA password field — appears after backend returns 422 */}
          {needs2fa && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-400 leading-relaxed">
                  Аккаунт защищён двухфакторной аутентификацией.
                  Введите пароль 2FA, который вы установили в настройках Telegram.
                </p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Пароль 2FA</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleVerify()}
                  placeholder="Пароль двухфакторной аутентификации"
                  autoFocus
                  className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[13px] outline-none focus:border-amber-500"
                />
              </label>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={() => void handleVerify()}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : needs2fa ? 'Войти' : 'Подтвердить'
            }
          </button>

          <button
            onClick={() => { setStep('credentials'); setCode(''); setPassword(''); setNeeds2fa(false); setError(null) }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            ← Изменить номер
          </button>
        </div>
      )}

      {/* ── Step 3: success ──────────────────────────────────────────────────── */}
      {step === 'success' && (
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <p className="text-[13px] font-semibold text-foreground">Подключено</p>
          <p className="text-[12px] text-muted-foreground">{connectedAs}</p>
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Приложение загружается...
          </p>
        </div>
      )}
    </div>
  )
}
