import { useState } from 'react'
import { TgSection, TgSettingRow, TgTextField, TgButton, TgSlider } from '@/components/tg'
import { setPin } from '@/api/pin'
import { getLockTimeoutMinutes, setLockTimeoutMinutes } from '@/hooks/usePinGuard'

interface Props {
  pinSet?: boolean
  onPinChanged?: () => void
}

/** Digits only, at most six — the PIN format the backend accepts. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

export function SecuritySection({ pinSet, onPinChanged }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lockMinutes, setLockMinutes] = useState(() => getLockTimeoutMinutes())
  /** Three password fields stay folded until the PIN is actually being changed. */
  const [formOpen, setFormOpen] = useState(false)

  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  const submit = async () => {
    if (next !== confirm) {
      setError(pinSet ? 'Новый PIN не совпадает с подтверждением' : 'PIN не совпадает с подтверждением')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setPin(next, pinSet ? current : undefined)
      setSuccess(pinSet ? 'PIN изменён' : 'PIN установлен! При следующем запуске потребуется ввод PIN')
      setCurrent('')
      setNext('')
      setConfirm('')
      setFormOpen(false)
      onPinChanged?.()
    } catch {
      setError(pinSet ? 'Неверный текущий PIN' : 'Ошибка установки PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <TgSection title="Безопасность">
      <TgSettingRow label="PIN-код" hint="Защита доступа к приложению и Telegram-сессии">
        <span
          className={
            pinSet
              ? 'rounded-tg-sm bg-tg-good/10 px-2 py-0.5 text-tg-sm text-tg-good'
              : 'rounded-tg-sm bg-[rgb(var(--tg-peer-3)/0.16)] px-2 py-0.5 text-tg-sm text-[rgb(var(--tg-peer-3))]'
          }
        >
          {pinSet ? 'Установлен' : 'Не установлен'}
        </span>
        <TgButton
          variant="light"
          onClick={() => { setFormOpen((v) => !v); clearMessages() }}
          className="h-7 px-2.5 text-tg-sm"
        >
          {pinSet ? 'Сменить' : 'Установить'}
        </TgButton>
      </TgSettingRow>

      {formOpen && (
      <div className="mx-[22px] mb-2 flex flex-col gap-2 rounded-tg-btn bg-tg-bg-over p-3">
        <p className="text-tg-box font-semibold text-tg-text-bold">
          {pinSet ? 'Сменить PIN' : 'Установить PIN'}
        </p>

        {pinSet && (
          <TgTextField
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="Текущий PIN"
            value={current}
            onChange={(v) => { setCurrent(onlyDigits(v)); clearMessages() }}
          />
        )}

        <TgTextField
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={pinSet ? 'Новый PIN (4-6 цифр)' : 'PIN (4-6 цифр)'}
          value={next}
          onChange={(v) => { setNext(onlyDigits(v)); clearMessages() }}
        />

        <TgTextField
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={pinSet ? 'Повторите новый PIN' : 'Повторите PIN'}
          value={confirm}
          onChange={(v) => { setConfirm(onlyDigits(v)); clearMessages() }}
        />

        <TgButton
          onClick={submit}
          disabled={saving || next.length < 4 || (pinSet === true && !current)}
          className="self-start"
        >
          {saving ? 'Сохранение...' : pinSet ? 'Сменить PIN' : 'Установить PIN'}
        </TgButton>

        {error && <p className="text-tg-sm text-tg-danger">{error}</p>}
      </div>
      )}

      {success && <p className="px-[22px] pb-2 text-tg-sm text-tg-good">{success}</p>}

      <TgSettingRow
        label="Автоблокировка"
        hint="Через сколько минут без действий запрашивать PIN (0 = выкл)"
      >
        <TgSlider
          value={lockMinutes}
          onChange={(v) => { setLockMinutes(v); setLockTimeoutMinutes(v) }}
          min={0}
          max={30}
        />
        <span className="min-w-[3rem] text-right text-tg-sm text-tg-text-sub">
          {lockMinutes === 0 ? 'Выкл' : `${lockMinutes} мин`}
        </span>
      </TgSettingRow>
    </TgSection>
  )
}
