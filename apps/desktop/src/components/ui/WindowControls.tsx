/**
 * WindowControls — три системные кнопки окна, всегда в правом верхнем углу.
 *
 * Кнопки:
 *   [−]  Свернуть в taskbar
 *   [⬜] Развернуть / Восстановить (иконка меняется по состоянию)
 *   [×]  Закрыть — показывает мини-меню:
 *          • Свернуть в трей
 *          • Закрыть полностью (убивает процесс)
 *
 * Компонент рендерится как `fixed top-0 right-0 z-[200]`, поэтому
 * автоматически присутствует на всех экранах (загрузка, авторизация,
 * настройки, главный экран).
 *
 * В браузере (не Electron) не рендерится.
 */
import { useEffect, useRef, useState } from 'react'
import { Minus, Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function WindowControls() {
  // Detect Electron via user-agent — reliable in both dev and packaged mode.
  // window.electronAPI may not be set yet on first render if the preload is
  // still initialising, so we don't use it for the visibility check.
  const isElectron =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('electron')

  const [isMaximized, setIsMaximized] = useState(false)
  const [showCloseMenu, setShowCloseMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Sync maximized state on mount + listen for changes from main process.
  // Guard with typeof checks — protects against stale or missing preload.
  useEffect(() => {
    if (!isElectron) return
    const api = window.electronAPI
    if (!api) return
    if (typeof api.getMaximized === 'function') {
      void api.getMaximized().then(setIsMaximized)
    }
    if (typeof api.onMaximizeChanged === 'function') {
      return api.onMaximizeChanged(setIsMaximized)
    }
  }, [isElectron])

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!showCloseMenu) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowCloseMenu(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCloseMenu(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showCloseMenu])

  if (!isElectron) return null

  const btnBase =
    'flex h-11 w-10 items-center justify-center transition-colors text-muted-foreground hover:text-foreground'

  return (
    // no-drag so button clicks are not swallowed by the draggable title bar
    <div
      className="fixed top-0 right-0 z-[200] flex items-stretch"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* ── Minimize ── */}
      <button
        onClick={() => window.electronAPI?.minimize()}
        title="Свернуть"
        className={cn(btnBase, 'hover:bg-white/10')}
      >
        <Minus size={13} strokeWidth={2} />
      </button>

      {/* ── Maximize / Restore ── */}
      <button
        onClick={() => window.electronAPI?.toggleMaximize?.()}
        title={isMaximized ? 'Восстановить' : 'Развернуть'}
        className={cn(btnBase, 'hover:bg-white/10')}
      >
        {isMaximized
          ? <Minimize2 size={12} strokeWidth={2} />
          : <Maximize2 size={12} strokeWidth={2} />
        }
      </button>

      {/* ── Close — with dropdown ── */}
      <div className="relative flex" ref={menuRef}>
        <button
          onClick={() => setShowCloseMenu(v => !v)}
          title="Закрыть"
          className={cn(btnBase, 'hover:bg-red-500/20 hover:text-red-400')}
        >
          <X size={13} strokeWidth={2} />
        </button>

        {showCloseMenu && (
          <div className="absolute right-0 top-[calc(100%+4px)] w-52 overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl ring-1 ring-black/10">
            <button
              onClick={() => {
                window.electronAPI?.closeToTray()
                setShowCloseMenu(false)
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[12px] text-foreground transition-colors hover:bg-accent"
            >
              <span className="text-base leading-none">🔽</span>
              Свернуть в трей
            </button>

            <div className="mx-3 border-t border-border/40" />

            <button
              onClick={() => {
                window.electronAPI?.quit?.()
                setShowCloseMenu(false)
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[12px] text-red-400 transition-colors hover:bg-red-500/10"
            >
              <X size={13} strokeWidth={2} className="shrink-0" />
              Закрыть полностью
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
