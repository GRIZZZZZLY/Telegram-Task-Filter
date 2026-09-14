import { useCallback, useState } from 'react'
import { Loader2, History, RotateCcw } from 'lucide-react'
import { TgSection, TgSettingRow, TgToggle, TgNumberField, TgButton } from '@/components/tg'
import { scanHistory } from '@/api/settings'
import type { ScanHistoryResult } from '@/api/settings'
import { apiFetch } from '@/api/client'
import { cn } from '@/lib/utils'
import type { SectionProps } from './TelegramSection'

interface GuardCheckResult {
  ok: boolean
  checked: number
  ok_count: number
  rolled_back: number
  skipped: number
}

export function HistorySection({ settings, patch }: SectionProps) {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanHistoryResult | null>(null)
  const [scanHours, setScanHours] = useState(8)
  const [scanError, setScanError] = useState<string | null>(null)
  const [guardChecking, setGuardChecking] = useState(false)
  const [guardResult, setGuardResult] = useState<GuardCheckResult | null>(null)
  const [guardError, setGuardError] = useState<string | null>(null)

  const handleScanHistory = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    try {
      setScanResult(await scanHistory(scanHours))
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }, [scanHours])

  const handleGuardCheck = useCallback(async () => {
    setGuardChecking(true)
    setGuardResult(null)
    setGuardError(null)
    try {
      setGuardResult(
        await apiFetch<GuardCheckResult>('/telegram/guard-check?hours=72&batch=300', { method: 'POST' }),
      )
    } catch (err) {
      setGuardError(err instanceof Error ? err.message : String(err))
    } finally {
      setGuardChecking(false)
    }
  }, [])

  return (
    <TgSection title="Сканирование истории">
      <TgSettingRow
        label="Авто-скан при запуске"
        hint="Сканировать историю сообщений при каждом запуске приложения"
      >
        <TgToggle
          checked={settings.catchup_enabled}
          onChange={(v) => patch('catchup_enabled', v)}
          label="Авто-скан при запуске"
        />
      </TgSettingRow>

      {settings.catchup_enabled && (
        <TgSettingRow label="Глубина скана" hint={`Последние ${settings.catchup_hours} ч`}>
          <TgNumberField
            value={settings.catchup_hours}
            onChange={(v) => patch('catchup_hours', v)}
            min={1}
            max={168}
          />
        </TgSettingRow>
      )}

      <div className="flex flex-col gap-2 px-[22px] pb-2 pt-2">
        <p className="text-tg-sm text-tg-text-sub">Ручной скан истории</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-tg-sm text-tg-text-sub">За последние</span>
          <TgNumberField value={scanHours} onChange={setScanHours} min={1} max={168} />
          <span className="text-tg-sm text-tg-text-sub">ч</span>
          <TgButton
            variant="light"
            onClick={handleScanHistory}
            disabled={scanning}
            className="h-7 px-2.5 text-tg-sm"
          >
            {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />}
            Сканировать
          </TgButton>
        </div>

        {scanResult && (
          <div
            className={cn(
              'rounded-tg-btn px-3 py-2 text-tg-sm',
              scanResult.ok ? 'bg-tg-good/10 text-tg-good' : 'bg-tg-danger/10 text-tg-danger',
            )}
          >
            {scanResult.ok
              ? `Просмотрено: ${scanResult.scanned} · Создано: ${scanResult.created} · Уже выполнено: ${scanResult.skipped_done} · Дубли: ${scanResult.skipped_dup}`
              : 'Ошибка сканирования'}
          </div>
        )}
        {scanError && (
          <div className="rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">
            Ошибка: {scanError}
          </div>
        )}
      </div>

      <div className="mx-[22px] mb-3 rounded-tg-btn border border-tg-divider p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-tg-sm text-tg-text-sub">Проверка guard</p>
          <TgButton
            variant="light"
            onClick={handleGuardCheck}
            disabled={guardChecking}
            className="h-7 px-2.5 text-tg-sm"
          >
            {guardChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Guard
          </TgButton>
        </div>

        <p className="text-tg-sm text-tg-text-sub">
          Что делает: проверяет, что реакции/ответы стоят только на сообщениях с твоим тегом; неверные реакции снимает и удаляет наш reply.
        </p>

        {guardResult && (
          <div className="mt-2 rounded-tg-btn bg-tg-good/10 px-3 py-2 text-tg-sm text-tg-good">
            Проверено: {guardResult.checked} · Ок: {guardResult.ok_count} · Откат: {guardResult.rolled_back} · Пропущено: {guardResult.skipped}
          </div>
        )}
        {guardError && (
          <div className="mt-2 rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">
            Ошибка guard: {guardError}
          </div>
        )}
      </div>
    </TgSection>
  )
}
