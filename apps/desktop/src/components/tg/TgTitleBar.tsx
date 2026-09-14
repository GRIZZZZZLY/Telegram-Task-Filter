import { useEffect, useRef, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TG_PX } from '@/lib/tg-motion'

interface Props {
  title?: string
}

/**
 * Telegram window strip: 24px tall, semibold 12px title, three 36x24 buttons.
 *
 * Replaces the old floating WindowControls, which sat on top of the content
 * and forced every screen to reserve 120px of empty space for it.
 *
 * Outside Electron nothing is rendered, so the page still works in a browser.
 */
export function TgTitleBar({ title = 'TG Focus Filter' }: Props) {
  const isElectron =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('electron')

  const [isMaximized, setIsMaximized] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  if (!isElectron) return null

  const btn = cn(
    'grid flex-none place-items-center text-tg-title-btn',
    'transition-colors duration-tg-universal hover:bg-tg-title-btn-over-bg hover:text-tg-title-btn-over',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tg-accent',
  )
  const btnSize = { width: TG_PX.titleButtonWidth, height: TG_PX.titleHeight }

  return (
    <div
      className="relative z-[60] flex flex-none items-center bg-tg-title-bg text-tg-title-text"
      style={{ height: TG_PX.titleHeight, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="min-w-0 flex-1 select-none truncate pl-[10px] text-[12px] font-semibold">
        {title}
      </span>

      <div
        className="flex flex-none items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => window.electronAPI?.minimize()}
          title="Свернуть"
          aria-label="Свернуть"
          style={btnSize}
          className={btn}
        >
          <Minus size={12} strokeWidth={1.6} />
        </button>

        <button
          type="button"
          onClick={() => window.electronAPI?.toggleMaximize()}
          title={isMaximized ? 'Восстановить' : 'Развернуть'}
          aria-label={isMaximized ? 'Восстановить' : 'Развернуть'}
          style={btnSize}
          className={btn}
        >
          {isMaximized
            ? <Copy size={11} strokeWidth={1.6} />
            : <Square size={10} strokeWidth={1.6} />}
        </button>

        <div className="relative flex" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Закрыть"
            aria-label="Закрыть"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={btnSize}
            className={cn(
              btn,
              'hover:bg-tg-title-close-over hover:text-tg-on-accent',
            )}
          >
            <X size={12} strokeWidth={1.6} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className={cn(
                'absolute right-0 top-full z-[70] w-[200px] overflow-hidden py-2',
                'rounded-tg-box bg-tg-menu-bg text-tg-text',
                'shadow-[0_1px_3px_var(--tg-shadow),0_8px_24px_var(--tg-shadow)]',
              )}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  window.electronAPI?.closeToTray()
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-[10px] px-[17px] pb-[7px] pt-2 text-left text-tg-base transition-colors duration-tg-universal hover:bg-tg-bg-over"
              >
                Свернуть в трей
              </button>

              <div className="my-1 h-px bg-tg-menu-separator" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  window.electronAPI?.quit?.()
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-[10px] px-[17px] pb-[7px] pt-2 text-left text-tg-base text-tg-danger transition-colors duration-tg-universal hover:bg-[var(--tg-danger-bg-over)]"
              >
                Закрыть полностью
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
