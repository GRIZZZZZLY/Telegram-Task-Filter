import { useEffect, useState } from 'react'
import { Pin, PinOff, Settings } from 'lucide-react'
import { ThemeToggler } from '@/components/ui/ThemeToggler'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  inboxCount: number
  onOpenSettings: () => void
}

/** True when the app runs inside Electron (not a plain browser). */
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export function TopBar({ inboxCount, onOpenSettings }: Props) {
  const { theme, toggle } = useTheme()
  const [pinned, setPinned] = useState(true)

  // Sync pin state from Electron on mount and listen for tray-menu changes
  useEffect(() => {
    if (!isElectron) return
    void window.electronAPI!.getPin().then(setPinned)
    const cleanup = window.electronAPI!.onPinChanged(setPinned)
    return cleanup
  }, [])

  const handlePin = () => window.electronAPI?.togglePin()

  return (
    <header
      // pr-[120px] reserves space for the 3 fixed WindowControls buttons (3 × w-10 = 120px)
      className="flex h-11 items-center justify-between border-b border-border/50 bg-background/60 pl-3 pr-[120px] backdrop-blur-md"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: title + badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight select-none">
          🔵 TG Filter
        </span>
        {inboxCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white select-none">
            {inboxCount}
          </span>
        )}
      </div>

      {/* Right: app controls — stop drag propagation so buttons are clickable */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ThemeToggler theme={theme} onToggle={toggle} />

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Настройки"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings size={14} />
        </button>

        {/* Pin / always-on-top toggle */}
        {isElectron && (
          <button
            onClick={handlePin}
            title={pinned ? 'Открепить' : 'Закрепить поверх всех окон'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {pinned
              ? <Pin size={14} className="text-indigo-400" />
              : <PinOff size={14} />
            }
          </button>
        )}
      </div>
    </header>
  )
}
