/**
 * TelegramAuthScreen — вход в Telegram.
 *
 * Три шага: ключи приложения и телефон, код из Telegram (плюс пароль
 * двухфакторной проверки, если он есть), готово.
 *
 * Ключи сохраняются в .env на первом шаге, поэтому переживают перезапуск.
 */
import { useState } from 'react'
import { Loader2, MessageCircle, CheckCircle2, ExternalLink, Lock } from 'lucide-react'
import { authStart, authVerify } from '@/api/auth'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { TgButton, TgTextField, TgOtpInput } from '@/components/tg'

interface Props {
  hasCredentials: boolean
  onConnected: (username: string) => void
}

type Step = 'credentials' | 'code' | 'success'

/** Pulls "detail" out of a JSON error body, falling back to the raw text. */
function errorDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(msg) as { detail?: string }
    return parsed.detail ?? msg
  } catch {
    return msg
  }
}

export function TelegramAuthScreen({ hasCredentials, onConnected }: Props) {
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [needs2fa, setNeeds2fa] = useState(false)
  const [step, setStep] = useState<Step>('credentials')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedAs, setConnectedAs] = useState('')

  const handleSendCode = async () => {
    setError(null)

    // If credentials are already configured, api_id/api_hash can be placeholders;
    // the backend will use the .env values.
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
      await authStart({
        api_id: id ? Number(id) : 0,
        api_hash: hash || '_use_env_',
        phone: phone.trim(),
      })
      setStep('code')
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }

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
        setError(errorDetail(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const subtitle =
    step === 'credentials' ? 'Войдите в аккаунт, чтобы получать задачи из чатов'
      : step === 'code' && !needs2fa ? `Код отправлен в Telegram на ${phone}`
      : step === 'code' ? 'Требуется пароль двухфакторной аутентификации'
      : 'Telegram успешно подключён'

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-5 py-6">
      <div className="mb-5 flex flex-col items-center gap-2">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-tg-accent/15">
          <MessageCircle className="h-6 w-6 text-tg-accent-text" />
        </div>
        <p className="text-tg-box font-semibold text-tg-text-bold">Подключение Telegram</p>
        <p className="text-center text-tg-sm leading-relaxed text-tg-text-sub">{subtitle}</p>
      </div>

      {/* Step indicator */}
      <div className="mb-5 flex items-center gap-2">
        {(['credentials', 'code', 'success'] as Step[]).map((s, i) => {
          const done = step === 'success' || (step === 'code' && i === 0)
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold',
                  'transition-colors duration-tg-universal',
                  step === s
                    ? 'bg-tg-accent text-tg-on-accent'
                    : done
                      ? 'bg-tg-accent/25 text-tg-accent-text'
                      : 'bg-tg-bg-over text-tg-text-sub',
                )}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div
                  className={cn(
                    'h-px w-6 transition-colors duration-tg-universal',
                    done ? 'bg-tg-accent/50' : 'bg-tg-divider',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {step === 'credentials' && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          {!hasCredentials ? (
            <div className="rounded-tg-btn border border-tg-divider p-3">
              <p className="mb-2 text-tg-sm text-tg-text-sub">API-ключи Telegram</p>
              <button
                type="button"
                onClick={() => window.electronAPI?.openExternal('https://my.telegram.org/apps')}
                className="mb-2.5 flex items-center gap-1 text-tg-sm text-tg-accent-text"
              >
                <ExternalLink className="h-3 w-3" />
                Получить на my.telegram.org → Apps
              </button>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-tg-sm text-tg-text-sub">API ID</span>
                  <TgTextField
                    type="number"
                    value={apiId}
                    onChange={setApiId}
                    placeholder="1234567"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-tg-sm text-tg-text-sub">API Hash</span>
                  <TgTextField
                    value={apiHash}
                    onChange={setApiHash}
                    placeholder="a1b2c3d4e5f6..."
                    className="font-mono text-tg-base"
                  />
                </label>
              </div>
            </div>
          ) : (
            <p className="rounded-tg-btn bg-tg-accent/10 px-3 py-2 text-tg-sm text-tg-accent-text">
              ✓ API-ключи уже настроены в .env — вводить повторно не нужно
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-tg-sm text-tg-text-sub">Номер телефона</span>
            <TgTextField
              type="tel"
              value={phone}
              onChange={setPhone}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSendCode() }}
              placeholder="+79001234567"
            />
          </label>

          {error && (
            <p className="rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">{error}</p>
          )}

          <TgButton fullWidth onClick={() => void handleSendCode()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отправить код'}
          </TgButton>
        </div>
      )}

      {step === 'code' && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <div className="flex flex-col items-center gap-2">
            <span className="text-tg-sm text-tg-text-sub">Код из Telegram</span>
            <TgOtpInput value={code} onChange={setCode} disabled={needs2fa} />
          </div>

          {!needs2fa && (
            <p className="text-tg-sm leading-relaxed text-tg-text-sub">
              💡 Если на аккаунте установлён пароль двухфакторной аутентификации (2FA),
              он потребуется после ввода кода.
            </p>
          )}

          {needs2fa && (
            <div className="flex flex-col gap-2 rounded-tg-btn border border-tg-divider p-3">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--tg-peer-3))]" />
                <p className="text-tg-sm leading-relaxed text-tg-text-sub">
                  Аккаунт защищён двухфакторной аутентификацией.
                  Введите пароль 2FA, который вы установили в настройках Telegram.
                </p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-tg-sm text-tg-text-sub">Пароль 2FA</span>
                <TgTextField
                  type="password"
                  value={password}
                  onChange={setPassword}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleVerify() }}
                  placeholder="Пароль двухфакторной аутентификации"
                  autoFocus
                />
              </label>
            </div>
          )}

          {error && (
            <p className="rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">{error}</p>
          )}

          <TgButton fullWidth onClick={() => void handleVerify()} disabled={loading}>
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : needs2fa ? 'Войти' : 'Подтвердить'}
          </TgButton>

          <button
            type="button"
            onClick={() => {
              setStep('credentials')
              setCode('')
              setPassword('')
              setNeeds2fa(false)
              setError(null)
            }}
            className="text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:text-tg-text"
          >
            ← Изменить номер
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-tg-good" />
          <p className="text-tg-box font-semibold text-tg-text-bold">Подключено</p>
          <p className="text-tg-base text-tg-text-sub">{connectedAs}</p>
          <p className="text-center text-tg-sm text-tg-text-sub">Приложение загружается...</p>
        </div>
      )}
    </div>
  )
}
