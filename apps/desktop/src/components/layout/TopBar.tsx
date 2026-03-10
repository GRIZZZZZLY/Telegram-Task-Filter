import { useEffect, useState } from 'react'
import { Pin, PinOff, Settings, BarChart2 } from 'lucide-react'
import { ThemeToggler } from '@/components/ui/ThemeToggler'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  inboxCount: number
  onOpenSettings: () => void
  onOpenStats: () => void
}

/** True when the app runs inside Electron (not a plain browser). */
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export function TopBar({ onOpenSettings, onOpenStats }: Props) {
  const { theme, toggle } = useTheme()
  const [pinned, setPinned] = useState(true)
  const [version, setVersion] = useState<string | null>(null)

  // Sync pin state from Electron on mount and listen for tray-menu changes
  useEffect(() => {
    if (!isElectron) return
    void window.electronAPI!.getPin().then(setPinned)
    const cleanup = window.electronAPI!.onPinChanged(setPinned)
    return cleanup
  }, [])

  // Fetch app version once on mount
  useEffect(() => {
    if (!isElectron) return
    void window.electronAPI!.getVersion().then(setVersion)
  }, [])

  const handlePin = () => window.electronAPI?.togglePin()

  return (
    <header
      className="relative flex h-11 items-center justify-between gap-2 border-b border-border/50 bg-background/60 pl-3 pr-[120px] backdrop-blur-md"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* no-drag cutout for WindowControls zone (right 120px) */}
      <div
        className="absolute right-0 top-0 h-full w-[120px]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />

      {/* Left: title + version */}
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span className="min-w-0 truncate text-sm font-semibold tracking-tight select-none">
          TTF
        </span>
        {version && (
          <span className="text-[11px] text-muted-foreground/60 font-normal select-none tracking-tight">
            v{version}
          </span>
        )}
      </div>

      {/* Right: app controls — stop drag propagation so buttons are clickable */}
      <div
        className="flex flex-shrink-0 items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="max-[420px]:hidden">
          <ThemeToggler theme={theme} onToggle={toggle} />
        </div>

        {/* Stats */}
        <button
          onClick={onOpenStats}
          title="Статистика"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <BarChart2 size={14} />
        </button>

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
