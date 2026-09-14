import { useState, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowRight, KeyRound, Lock } from 'lucide-react'
import { OtpInput } from './OtpInput'
import { TgWindowFrame } from '@/components/tg'
import { useSetup } from '@/hooks/useSetup'

const variants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
}

function CredentialsStep({
  onSubmit,
  submitting,
  error,
}: {
  onSubmit: (params: { apiId: number; apiHash: string; phone: string }) => void
  submitting: boolean
  error: string | null
}) {
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const id = parseInt(apiId, 10)
    if (!id || !apiHash || !phone) return
    onSubmit({ apiId: id, apiHash: apiHash.trim(), phone: phone.trim() })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          API ID
        </label>
        <input
          type="number"
          value={apiId}
          onChange={(e) => setApiId(e.target.value)}
          placeholder="12345678"
          required
          className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          API Hash
        </label>
        <input
          type="text"
          value={apiHash}
          onChange={(e) => setApiHash(e.target.value)}
          placeholder="a1b2c3d4e5f6..."
          required
          className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm font-mono outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Номер телефона
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+79001234567"
          required
          className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !apiId || !apiHash || !phone}
        className="flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Получить код
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  )
}

function OtpStep({
  hint,
  onSubmit,
  submitting,
  error,
  needs2fa,
}: {
  hint: string
  onSubmit: (code: string, password?: string) => void
  submitting: boolean
  error: string | null
  needs2fa: boolean
}) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')

  const handleConfirm = () => {
    if (code.length !== 5) return
    if (needs2fa && !password.trim()) return
    onSubmit(code, needs2fa ? password.trim() : undefined)
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-center text-sm text-muted-foreground">{hint}</p>

      <OtpInput value={code} onChange={setCode} disabled={submitting || needs2fa} />

      {needs2fa && (
        <div className="flex w-full flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="text-[11px] text-amber-400 leading-relaxed">
              Аккаунт защищён 2FA. Введите пароль Telegram.
            </p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            placeholder="Пароль двухфакторной аутентификации"
            autoFocus
            className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-[13px] outline-none focus:border-amber-500"
          />
        </div>
      )}

      {!needs2fa && (
        <p className="text-center text-[11px] text-muted-foreground/60">
          💡 Если включён 2FA — пароль запросится после ввода кода
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        onClick={handleConfirm}
        disabled={submitting || code.length < 5 || (needs2fa && !password.trim())}
        className="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : needs2fa ? 'Войти' : 'Подтвердить'}
      </button>
    </div>
  )
}

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { step, hint, error, submitting, needs2fa, startAuth, verifyOtp } = useSetup()

  // Auto-redirect when done
  if (step === 'done') {
    onComplete()
    return null
  }

  if (step === 'loading') {
    return (
      <TgWindowFrame>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-tg-text-sub" />
        </div>
      </TgWindowFrame>
    )
  }

  return (
    <TgWindowFrame className="items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6 shadow-2xl backdrop-blur-md">
          {/* Заголовок */}
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
              <KeyRound className="h-5 w-5 text-indigo-400" />
            </div>
            <h1 className="text-lg font-semibold">Настройка Telegram</h1>
            <p className="text-xs text-muted-foreground">
              {step === 'credentials'
                ? 'Введите данные из my.telegram.org/apps'
                : 'Введите код из Telegram'}
            </p>
          </div>

          {/* Шаги */}
          <AnimatePresence mode="wait">
            {step === 'credentials' && (
              <motion.div
                key="credentials"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <CredentialsStep
                  onSubmit={startAuth}
                  submitting={submitting}
                  error={error}
                />
              </motion.div>
            )}

            {step === 'otp' && (
              <motion.div
                key="otp"
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <OtpStep
                  hint={hint}
                  onSubmit={verifyOtp}
                  submitting={submitting}
                  error={error}
                  needs2fa={needs2fa}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </TgWindowFrame>
  )
}
