import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { AnimatedGradientBg } from '@/components/ui/AnimatedGradientBg'
import { WindowControls } from '@/components/ui/WindowControls'
import { TopBar } from './TopBar'
import { FilterTabs } from './FilterTabs'
import { TaskList } from '@/components/tasks/TaskList'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { StatsScreen } from '@/components/stats/StatsScreen'
import { TelegramAuthScreen } from '@/components/auth/TelegramAuthScreen'
import { getSettings } from '@/api/settings'
import { getAuthStatus } from '@/api/auth'
import { useBackendReady } from '@/hooks/useBackendReady'
import { useTabCounts } from '@/hooks/useTabCounts'
import { setSoundEnabled, setNotificationSound } from '@/lib/sound'
import type { SoundPreset } from '@/lib/sound'
import { setMentionHandles } from '@/lib/text'
import type { TabId } from '@/types/task'

// ── Auth state ────────────────────────────────────────────────────────────────

type AuthState =
  | { checked: false }
  | { checked: true; connected: boolean; hasCredentials: boolean; sessionExists: boolean }

// ── Drag strip ────────────────────────────────────────────────────────────────
// Used on full-screen loading/error/spinner screens that have no TopBar.
// Creates a thin draggable strip at the top, with the right 120 px explicitly
// marked no-drag so the fixed WindowControls buttons remain clickable.

function DragStrip() {
  return (
    <div
      className="absolute inset-x-0 top-0 h-11"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Right 120 px reserved for WindowControls (3 × w-10) */}
      <div
        className="absolute right-0 top-0 h-full w-[120px]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
    </div>
  )
}

// ── AppShell ──────────────────────────────────────────────────────────────────

interface AppShellProps {
  pinSet?: boolean
  onPinChanged?: () => void
}

export function AppShell({ pinSet, onPinChanged }: AppShellProps = {}) {
  const { ready, elapsed, timedOut } = useBackendReady()
  const [tab, setTab] = useState<TabId>('inbox')
  const [inboxCount, setInboxCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [compact, setCompact] = useState(false)
  const [authState, setAuthState] = useState<AuthState>({ checked: false })
  const [taskRefreshKey, setTaskRefreshKey] = useState(0)
  const tabCounts = useTabCounts()

  // Once backend is ready, check if Telegram is authorized
  useEffect(() => {
    if (!ready) return
    getAuthStatus()
      .then((status) => {
        setAuthState({
          checked: true,
          connected: status.authenticated,
          hasCredentials: status.has_credentials,
          sessionExists: status.session_exists,
        })
      })
      .catch(() => {
        // Can't reach backend auth — allow through to main UI anyway
        setAuthState({ checked: true, connected: true, hasCredentials: true, sessionExists: true })
      })
  }, [ready])

  // Load settings from backend and sync relevant ones to Electron main process
  useEffect(() => {
    if (!ready || (authState.checked && !authState.connected)) return
    getSettings()
      .then((s) => {
        setCompact(s.compact_mode)
        // Store mention handles for display stripping in TaskCard / TaskDetailModal
        setMentionHandles(s.tg_mention_handles)
        // Sync sound to renderer-side synth (custom sound)
        setSoundEnabled(s.sound_enabled)
        setNotificationSound(s.notification_sound as SoundPreset)
        // Sync notifications flag to Electron main (OS notifications); sound is silent there
        window.electronAPI?.setSoundEnabled(false)
        window.electronAPI?.setNotificationsEnabled(s.notifications_enabled)
      })
      .catch(() => {/* ignore */})
  }, [ready, showSettings, authState])

  // ── Backend timed out ─────────────────────────────────────────────────────

  if (timedOut) {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center">
        <AnimatedGradientBg />
        <DragStrip />
        <WindowControls />
        <p className="text-2xl">⚠️</p>
        <p className="text-sm font-medium text-foreground">Бэкенд не отвечает</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Python-сервер не запустился за {elapsed}с.<br />
          Убедитесь, что venv создан и зависимости установлены.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-1 rounded-lg border border-border/50 px-4 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          Перезапустить
        </button>
      </div>
    )
  }

  // ── Backend loading ───────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-4 overflow-hidden">
        <AnimatedGradientBg />
        <DragStrip />
        <WindowControls />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-indigo-500"
              style={{ animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out` }}
            />
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {elapsed < 2 ? 'Запуск...' : `Подключение${elapsed > 4 ? ` (${elapsed}с)` : '...'}`}
        </p>
        <style>{`
          @keyframes bounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40%            { transform: scale(1);   opacity: 1;   }
          }
        `}</style>
      </div>
    )
  }

  // ── Auth status loading ───────────────────────────────────────────────────

  if (!authState.checked) {
    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-4 overflow-hidden">
        <AnimatedGradientBg />
        <DragStrip />
        <WindowControls />
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p className="text-[12px] text-muted-foreground">Проверка авторизации...</p>
      </div>
    )
  }

  // ── Session exists but service didn't connect ─────────────────────────────
  // Happens when: network issue at startup, Telegram rate-limit, etc.
  // The session file is on disk — don't force the user through the full
  // auth wizard. Show a retry button instead.

  if (authState.checked && !authState.connected && authState.sessionExists) {
    const retry = () => {
      setAuthState({ checked: false })
      getAuthStatus()
        .then((s) => setAuthState({
          checked: true,
          connected: s.authenticated,
          hasCredentials: s.has_credentials,
          sessionExists: s.session_exists,
        }))
        .catch(() =>
          setAuthState({ checked: true, connected: true, hasCredentials: true, sessionExists: true })
        )
    }

    const reauth = () =>
      setAuthState({
        checked: true,
        connected: false,
        hasCredentials: authState.hasCredentials,
        sessionExists: false,
      })

    return (
      <div className="relative flex h-screen flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center">
        <AnimatedGradientBg />
        <DragStrip />
        <WindowControls />
        <p className="text-2xl">⚡</p>
        <p className="text-sm font-medium text-foreground">Telegram не подключился</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Сессия найдена, но сервис не запустился.<br />
          Проверьте интернет-соединение и попробуйте ещё раз.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={retry}
            className="rounded-lg bg-indigo-500 px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-600"
          >
            Повторить
          </button>
          <button
            onClick={reauth}
            className="rounded-lg border border-border/50 px-4 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Войти заново
          </button>
        </div>
      </div>
    )
  }

  // ── Full auth wizard ──────────────────────────────────────────────────────
  // session_exists=false → user has never authenticated (or session was lost)

  if (authState.checked && !authState.connected) {
    return (
      <div className="relative flex h-screen flex-col overflow-hidden">
        <AnimatedGradientBg />
        <WindowControls />
        {/* Drag handle: left part draggable, right 120 px reserved for WindowControls */}
        <div
          className="flex h-11 flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex-1" />
          <div
            className="w-[120px]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          />
        </div>
        <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
          <TelegramAuthScreen
            hasCredentials={authState.hasCredentials}
            onConnected={() =>
              setAuthState({ checked: true, connected: true, hasCredentials: true, sessionExists: true })
            }
          />
        </div>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <AnimatedGradientBg />
      <WindowControls />

      {/* Settings — монтируется поверх основного UI, но не размонтирует его */}
      {showSettings && (
        <SettingsScreen
          onClose={() => setShowSettings(false)}
          pinSet={pinSet}
          onPinChanged={onPinChanged}
          onSaved={() => setTaskRefreshKey((k) => k + 1)}
        />
      )}

      {/* Stats — полноэкранный оверлей статистики */}
      {showStats && (
        <StatsScreen onClose={() => setShowStats(false)} />
      )}

      {/* Main UI — скрывается через CSS когда открыты настройки или статистика,
          но остаётся смонтированным чтобы WebSocket и звук работали */}
      <div className={cn('flex flex-1 flex-col overflow-hidden', (showSettings || showStats) && 'hidden')}>
        <TopBar
          inboxCount={inboxCount}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStats={() => setShowStats(true)}
        />

        {/* Tabs */}
        <div className="flex items-center justify-center border-b border-border/30 px-2 py-2 backdrop-blur-sm">
          <div className="w-full max-w-full overflow-x-auto">
            <div className="mx-auto w-max">
              <FilterTabs
                active={tab}
                onChange={setTab}
                counts={{ inbox: inboxCount, done: tabCounts.done, snoozed: tabCounts.snoozed }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="flex flex-1 flex-col overflow-y-auto p-3">
          <TaskList
            tab={tab}
            compact={compact}
            onInboxCountChange={setInboxCount}
            refreshTrigger={taskRefreshKey}
          />
        </main>
      </div>
    </div>
  )
}
