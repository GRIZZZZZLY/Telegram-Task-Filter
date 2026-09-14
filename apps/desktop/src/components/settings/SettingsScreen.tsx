/**
 * SettingsScreen — каркас настроек.
 *
 * Держит загруженные настройки, сохранение и шапку. Каждый раздел живёт
 * в своём файле в ./sections и получает settings и patch.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { getSettings, updateSettings, restartListener } from '@/api/settings'
import type { AppSettings } from '@/types/settings'
import { TgIconButton, TgButton } from '@/components/tg'
import { cn } from '@/lib/utils'
import { TelegramSection } from './sections/TelegramSection'
import { FiltersSection } from './sections/FiltersSection'
import { ReactionSection } from './sections/ReactionSection'
import { CleanupSection } from './sections/CleanupSection'
import { HistorySection } from './sections/HistorySection'
import { SecuritySection } from './sections/SecuritySection'
import { AppearanceSection } from './sections/AppearanceSection'
import { UpdatesSection } from './sections/UpdatesSection'
import { DiagnosticsSection } from './sections/DiagnosticsSection'

interface Props {
  onClose: () => void
  pinSet?: boolean
  onPinChanged?: () => void
  /** Called after a successful save — lets parent refresh the task list */
  onSaved?: () => void
}

export function SettingsScreen({ onClose, pinSet, onPinChanged, onSaved }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    void window.electronAPI?.getVersion().then(setAppVersion)
  }, [])

  const loadSettings = useCallback(() => {
    setLoadError(null)
    getSettings()
      .then(setSettings)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Failed to load settings:', msg)
        setLoadError(msg)
      })
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const patch = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev)
  }, [])

  const save = useCallback(async () => {
    if (!settings) return
    setSaving(true)
    try {
      setSettings(await updateSettings(settings))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      onSaved?.()
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }, [settings, onSaved])

  /** Save settings AND restart the Telethon listener (for chat/thread changes) */
  const saveAndRestart = useCallback(async () => {
    if (!settings) return
    setRestarting(true)
    try {
      setSettings(await updateSettings(settings))
      await restartListener()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
      onSaved?.()
    } catch (err) {
      console.error('Failed to save & restart:', err)
    } finally {
      setRestarting(false)
    }
  }, [settings, onSaved])

  return (
    <div className="flex h-full flex-col bg-tg-bg">
      {/* Header */}
      <div className="flex h-11 flex-none items-center gap-2 border-b border-tg-divider px-2 pl-1">
        <TgIconButton label="Назад" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </TgIconButton>
        <span className="text-tg-box font-semibold text-tg-text-bold">Настройки</span>

        <div className="ml-auto flex items-center gap-1.5">
          <TgButton
            onClick={save}
            disabled={saving || restarting || !settings}
            className={cn('h-7 px-2.5 text-tg-sm', savedFlash && 'bg-tg-good hover:bg-tg-good')}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : savedFlash ? '✓ Ok' : 'Сохранить'}
          </TgButton>

          <TgButton
            variant="light"
            onClick={saveAndRestart}
            disabled={saving || restarting || !settings}
            title="Сохранить настройки и перезапустить слушатель чатов"
            className="h-7 px-2.5 text-tg-sm"
          >
            {restarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Применить
          </TgButton>
        </div>
      </div>

      {/* Body */}
      {loadError !== null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-tg-base text-tg-text-sub">Не удалось загрузить настройки</p>
          <p className="max-w-[280px] break-all rounded-tg-btn bg-tg-danger/10 px-3 py-2 font-mono text-tg-sm text-tg-danger">
            {loadError || 'Unknown error'}
          </p>
          <TgButton variant="light" onClick={loadSettings}>
            <RefreshCw className="h-3 w-3" />
            Повторить
          </TgButton>
        </div>
      ) : !settings ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-tg-text-sub" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TelegramSection settings={settings} patch={patch} />
          <FiltersSection settings={settings} patch={patch} />
          <ReactionSection settings={settings} patch={patch} />
          <CleanupSection settings={settings} patch={patch} />
          <HistorySection settings={settings} patch={patch} />
          <SecuritySection pinSet={pinSet} onPinChanged={onPinChanged} />
          <AppearanceSection settings={settings} patch={patch} />
          <UpdatesSection />
          <DiagnosticsSection />

          {appVersion && (
            <p className="py-3 text-center text-tg-sm text-tg-text-sub">
              TG Focus Filter v{appVersion}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
