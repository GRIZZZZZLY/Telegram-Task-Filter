/**
 * UpdateModal — shown automatically when a new version is available.
 *
 * Fetches release notes from GitHub Releases API for the available version,
 * then presents them with "Обновить" / "Пропустить" buttons.
 *
 * States:
 *   available   → show modal with changelog + buttons
 *   downloading → progress bar, buttons disabled
 *   downloaded  → "Установить и перезапустить" button
 *   error       → error message, retry option
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
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

async function fetchChangelog(version: string): Promise<string | null> {
  try {
    const tag = version.startsWith('v') ? version : `v${version}`
    const res = await fetch(
      `https://api.github.com/repos/GRIZZZZZLY/Telegram-Task-Filter/releases/tags/${tag}`,
      { headers: { Accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) return null
    const data = await res.json() as { body?: string }
    return data.body?.trim() || null
  } catch {
    return null
  }
}

interface Props {
  /** Called when user clicks "Пропустить" or closes the modal */
  onDismiss: () => void
}

export function UpdateModal({ onDismiss }: Props) {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [changelog, setChangelog] = useState<string | null>(null)
  const [changelogLoading, setChangelogLoading] = useState(false)

  // Subscribe to updater state changes from Electron main process
  useEffect(() => {
    if (!window.electronAPI) return

    // Get initial state
    void window.electronAPI.updatesGetState().then((raw) => {
      const s = parseUpdateState(raw)
      if (s) setUpdateState(s)
    })

    // Listen for live updates
    const cleanup = window.electronAPI.onUpdatesStateChanged((raw) => {
      const s = parseUpdateState(raw)
      if (s) setUpdateState(s)
    })

    return cleanup
  }, [])

  // Fetch changelog when version becomes known
  useEffect(() => {
    const version = updateState?.availableVersion
    if (!version || changelog !== null) return
    setChangelogLoading(true)
    void fetchChangelog(version).then((text) => {
      setChangelog(text)
      setChangelogLoading(false)
    })
  }, [updateState?.availableVersion, changelog])

  const isVisible =
    updateState !== null &&
    ['available', 'downloading', 'downloaded', 'error'].includes(updateState.status)

  const handleDownload = () => {
    void window.electronAPI?.updatesDownload()
  }

  const handleInstall = () => {
    window.electronAPI?.updatesInstall()
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={updateState?.status === 'available' ? onDismiss : undefined}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-x-3 top-14 z-50 rounded-xl border border-border/60 bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-border/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    Доступно обновление
                  </p>
                  {updateState?.availableVersion && (
                    <p className="text-[11px] text-muted-foreground">
                      {updateState.currentVersion} → v{updateState.availableVersion}
                    </p>
                  )}
                </div>
              </div>
              {updateState?.status === 'available' && (
                <button
                  onClick={onDismiss}
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Changelog */}
            <div className="max-h-[280px] overflow-y-auto px-4 py-3">
              {changelogLoading ? (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Загрузка описания...
                </div>
              ) : changelog ? (
                <div className="space-y-1">
                  {changelog.split('\n').map((line, i) => {
                    const trimmed = line.trim()
                    if (!trimmed) return <div key={i} className="h-1" />
                    // Bold headers (## or **)
                    if (trimmed.startsWith('## ')) {
                      return (
                        <p key={i} className="text-[12px] font-semibold text-foreground pt-1">
                          {trimmed.replace(/^##\s*/, '')}
                        </p>
                      )
                    }
                    // Bullet points
                    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                      return (
                        <p key={i} className="text-[12px] text-muted-foreground pl-2">
                          · {trimmed.replace(/^[-•]\s*/, '')}
                        </p>
                      )
                    }
                    return (
                      <p key={i} className="text-[12px] text-muted-foreground">
                        {trimmed}
                      </p>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  Описание изменений недоступно.
                </p>
              )}
            </div>

            {/* Progress bar — downloading */}
            {updateState?.status === 'downloading' && (
              <div className="px-4 pb-2">
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${updateState.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Загрузка... {Math.round(updateState.progress)}%
                </p>
              </div>
            )}

            {/* Downloaded */}
            {updateState?.status === 'downloaded' && (
              <div className="flex items-center gap-2 px-4 pb-3 text-[12px] text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                Обновление загружено и готово к установке
              </div>
            )}

            {/* Error */}
            {updateState?.status === 'error' && (
              <div className="flex items-start gap-2 px-4 pb-3 text-[12px] text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{updateState.message ?? 'Ошибка при загрузке обновления'}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border/40 px-4 py-3">
              {updateState?.status === 'available' && (
                <>
                  <button
                    onClick={onDismiss}
                    className="rounded-lg border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    Пропустить
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-600"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Обновить
                  </button>
                </>
              )}

              {updateState?.status === 'downloading' && (
                <button
                  disabled
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg bg-indigo-500/50 px-3 py-1.5',
                    'text-[12px] font-medium text-white/70 cursor-not-allowed',
                  )}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Загрузка...
                </button>
              )}

              {updateState?.status === 'downloaded' && (
                <>
                  <button
                    onClick={onDismiss}
                    className="rounded-lg border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    Позже
                  </button>
                  <button
                    onClick={handleInstall}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-600"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Установить и перезапустить
                  </button>
                </>
              )}

              {updateState?.status === 'error' && (
                <>
                  <button
                    onClick={onDismiss}
                    className="rounded-lg border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    Закрыть
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Повторить
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
