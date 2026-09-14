/**
 * SettingsScreen — каркас настроек.
 *
 * Держит загруженные настройки, автосохранение и шапку. Каждый раздел живёт
 * в своём файле в ./sections и получает settings и patch.
 *
 * Кнопок «Сохранить» и «Применить» нет: изменение уходит на сервер через
 * 400 мс после последней правки, а изменение чатов, веток или своего тега
 * само перезапускает слушатель.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { getSettings, updateSettings, restartListener } from '@/api/settings'
import type { AppSettings, AppSettingsUpdate } from '@/types/settings'
import { TgIconButton, TgButton, TgToast } from '@/components/tg'
import { TelegramSection } from './sections/TelegramSection'
import { FiltersSection } from './sections/FiltersSection'
import { ReactionSection } from './sections/ReactionSection'
import { CleanupSection } from './sections/CleanupSection'
import { HistorySection } from './sections/HistorySection'
import { SecuritySection } from './sections/SecuritySection'
import { NotificationsSection } from './sections/NotificationsSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { UpdatesSection } from './sections/UpdatesSection'
import { DiagnosticsSection } from './sections/DiagnosticsSection'

const SAVE_DEBOUNCE_MS = 400

/** Changing any of these means the chat listener has to be restarted. */
const LISTENER_KEYS: ReadonlyArray<keyof AppSettings> = [
  'tg_monitored_chat_ids',
  'tg_monitored_thread_ids',
  'tg_mention_handles',
]

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

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
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  /** Latest values, so the debounced flush never sends a stale object. */
  const latestRef = useRef<AppSettings | null>(null)
  /** Keys edited since the last successful save. */
  const dirtyRef = useRef<Set<keyof AppSettings>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  useEffect(() => {
    void window.electronAPI?.getVersion().then(setAppVersion)
  }, [])

  const loadSettings = useCallback(() => {
    setLoadError(null)
    getSettings()
      .then((s) => {
        latestRef.current = s
        setSettings(s)
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Failed to load settings:', msg)
        setLoadError(msg)
      })
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const flush = useCallback(async () => {
    const current = latestRef.current
    const keys = [...dirtyRef.current]
    if (!current || keys.length === 0) return

    dirtyRef.current = new Set()
    const body = keys.reduce<AppSettingsUpdate>((acc, key) => {
      // The whole object is typed; a per-key copy keeps that typing intact.
      return { ...acc, [key]: current[key] }
    }, {})
    const needsRestart = keys.some((k) => LISTENER_KEYS.includes(k))

    setSaveState('saving')
    try {
      const saved = await updateSettings(body)
      latestRef.current = saved
      setSettings(saved)
      if (needsRestart) {
        await restartListener()
        setToast('Слушатель чатов перезапущен')
      }
      setSaveState('saved')
      onSavedRef.current?.()
    } catch (err) {
      // Put the keys back so the next edit retries them too.
      keys.forEach((k) => dirtyRef.current.add(k))
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to save settings:', msg)
      setSaveState('error')
      setToast(`Не сохранилось: ${msg}`)
    }
  }, [])

  const patch = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      latestRef.current = next
      return next
    })
    dirtyRef.current.add(key)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flush() }, SAVE_DEBOUNCE_MS)
  }, [flush])

  // Leaving the screen must not drop an edit made half a second ago.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void flush()
    }
  }, [flush])

  const close = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    void flush()
    onClose()
  }, [flush, onClose])

  return (
    <div className="flex h-full flex-col bg-tg-bg">
      {/* Header */}
      <div className="flex h-11 flex-none items-center gap-2 border-b border-tg-divider px-2 pl-1">
        <TgIconButton label="Назад" onClick={close}>
          <ArrowLeft className="h-4 w-4" />
        </TgIconButton>
        <span className="text-tg-box font-semibold text-tg-text-bold">Настройки</span>

        <div className="ml-auto flex items-center gap-1.5 pr-1 text-tg-sm">
          {saveState === 'saving' && (
            <span className="flex items-center gap-1 text-tg-text-sub">
              <Loader2 className="h-3 w-3 animate-spin" />
              Сохраняю
            </span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-tg-text-sub">
              <Check className="h-3 w-3 text-tg-good" />
              Сохранено
            </span>
          )}
          {saveState === 'error' && (
            <button
              type="button"
              onClick={() => void flush()}
              className="flex items-center gap-1 rounded-tg-btn px-1.5 py-0.5 text-tg-danger transition-colors duration-tg-universal hover:bg-tg-bg-over"
            >
              <AlertTriangle className="h-3 w-3" />
              Не сохранилось — повторить
            </button>
          )}
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
          <CleanupSection settings={settings} patch={patch} notify={setToast} />
          <HistorySection settings={settings} patch={patch} />
          <SecuritySection pinSet={pinSet} onPinChanged={onPinChanged} />
          <NotificationsSection settings={settings} patch={patch} />
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

      <TgToast
        open={toast !== null}
        text={toast ?? ''}
        onDismiss={() => setToast(null)}
      />
    </div>
  )
}
