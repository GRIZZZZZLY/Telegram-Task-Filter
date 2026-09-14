import { useEffect, useState } from 'react'
import { Pin, PinOff, Settings, BarChart2, Sun, Moon } from 'lucide-react'
import { TgIconButton } from '@/components/tg'
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
    <header className="flex h-11 flex-none items-center justify-between gap-2 border-b border-tg-divider bg-tg-bg px-2 pl-3">
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span className="select-none text-tg-box font-semibold text-tg-text-bold">
          Задачи
        </span>
        {version && (
          <span className="select-none text-tg-sm text-tg-text-sub">
            v{version}
          </span>
        )}
      </div>

      <div className="flex flex-none items-center gap-0.5">
        <TgIconButton
          label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={toggle}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </TgIconButton>

        <TgIconButton label="Статистика" onClick={onOpenStats}>
          <BarChart2 size={16} />
        </TgIconButton>

        <TgIconButton label="Настройки" onClick={onOpenSettings}>
          <Settings size={16} />
        </TgIconButton>

        {isElectron && (
          <TgIconButton
            label={pinned ? 'Открепить' : 'Закрепить поверх всех окон'}
            onClick={handlePin}
            className={pinned ? 'text-tg-accent-text' : undefined}
          >
            {pinned ? <Pin size={16} /> : <PinOff size={16} />}
          </TgIconButton>
        )}
      </div>
    </header>
  )
}
