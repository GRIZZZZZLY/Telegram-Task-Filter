import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Download, CheckCircle2 } from 'lucide-react'
import { TgSection, TgSettingRow, TgButton } from '@/components/tg'
import { cn } from '@/lib/utils'

interface UpdateState {
  status: 'idle' | 'unsupported' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  availableVersion: string | null
  progress: number
  message: string | null
  checkedAt: string | null
}

function parseUpdateState(value: unknown): UpdateState | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<UpdateState>
  if (typeof v.status !== 'string' || typeof v.currentVersion !== 'string') return null
  return {
    status: v.status as UpdateState['status'],
    currentVersion: v.currentVersion,
    availableVersion: typeof v.availableVersion === 'string' ? v.availableVersion : null,
    progress: typeof v.progress === 'number' ? v.progress : 0,
    message: typeof v.message === 'string' ? v.message : null,
    checkedAt: typeof v.checkedAt === 'string' ? v.checkedAt : null,
  }
}

export function UpdatesSection() {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)

  useEffect(() => {
    void window.electronAPI?.getVersion().then(setAppVersion)
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.updatesGetState || !api?.onUpdatesStateChanged) return

    let active = true
    void api.updatesGetState().then((state) => {
      if (active) setUpdateState(parseUpdateState(state))
    })
    const unsubscribe = api.onUpdatesStateChanged((state) => setUpdateState(parseUpdateState(state)))
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const handleCheck = useCallback(async () => {
    try {
      const state = await window.electronAPI?.updatesCheck?.()
      if (state) setUpdateState(parseUpdateState(state))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdateState((prev) => prev ? { ...prev, status: 'error', message: msg } : {
        status: 'error',
        currentVersion: appVersion ?? 'unknown',
        availableVersion: null,
        progress: 0,
        message: msg,
        checkedAt: new Date().toISOString(),
      })
    }
  }, [appVersion])

  const handleDownload = useCallback(async () => {
    try {
      const state = await window.electronAPI?.updatesDownload?.()
      if (state) setUpdateState(parseUpdateState(state))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdateState((prev) => prev ? { ...prev, status: 'error', message: msg } : null)
    }
  }, [])

  if (!window.electronAPI) {
    return (
      <TgSection title="Обновления приложения">
        <p className="px-[22px] pb-3 pt-1 text-tg-sm text-tg-text-sub">
          Обновления доступны только в desktop-сборке Electron.
        </p>
      </TgSection>
    )
  }

  return (
    <TgSection title="Обновления приложения">
      <TgSettingRow
        label="Текущая версия"
        hint={updateState?.availableVersion ? `Доступна версия ${updateState.availableVersion}` : undefined}
      >
        <span className="text-tg-sm text-tg-text-sub">
          v{updateState?.currentVersion ?? appVersion ?? '—'}
        </span>
      </TgSettingRow>

      {updateState?.message && (
        <p
          className={cn(
            'mx-[22px] mb-2 rounded-tg-btn px-3 py-2 text-tg-sm',
            updateState.status === 'error'
              ? 'bg-tg-danger/10 text-tg-danger'
              : 'bg-tg-bg-over text-tg-text-sub',
          )}
        >
          {updateState.message}
        </p>
      )}

      {updateState?.status === 'downloading' && (
        <div className="mx-[22px] mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tg-bg-over">
            <div
              className="h-full rounded-full bg-tg-accent transition-all"
              style={{ width: `${Math.max(0, Math.min(100, updateState.progress))}%` }}
            />
          </div>
          <span className="w-10 text-right text-tg-sm tabular-nums text-tg-text-sub">
            {Math.round(updateState.progress)}%
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-[22px] pb-2">
        <TgButton
          variant="light"
          onClick={handleCheck}
          disabled={updateState?.status === 'checking' || updateState?.status === 'downloading'}
          className="h-7 px-2.5 text-tg-sm"
        >
          {updateState?.status === 'checking'
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />}
          Проверить обновления
        </TgButton>

        {(updateState?.status === 'available' || updateState?.status === 'downloading') && (
          <TgButton
            variant="light"
            onClick={handleDownload}
            disabled={updateState?.status === 'downloading'}
            className="h-7 px-2.5 text-tg-sm"
          >
            {updateState?.status === 'downloading'
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Download className="h-3 w-3" />}
            {updateState?.status === 'downloading' ? 'Загрузка…' : 'Скачать'}
          </TgButton>
        )}

        {updateState?.status === 'downloaded' && (
          <TgButton onClick={() => window.electronAPI?.updatesInstall?.()} className="h-7 px-2.5 text-tg-sm">
            <CheckCircle2 className="h-3 w-3" />
            Перезапустить и установить
          </TgButton>
        )}
      </div>

      <p className="px-[22px] pb-3 text-tg-sm text-tg-text-sub">
        Автообновление поддерживается для установленной версии (NSIS). Portable обновляется вручную.
      </p>
    </TgSection>
  )
}
