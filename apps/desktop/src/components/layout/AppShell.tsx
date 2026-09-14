import { useState, useEffect } from 'react'
import { TgWindowFrame, TgSlidePanel, TgButton } from '@/components/tg'
import { TopBar } from './TopBar'
import { FilterTabs } from './FilterTabs'
import { TaskList } from '@/components/tasks/TaskList'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { StatsScreen } from '@/components/stats/StatsScreen'
import { TelegramAuthScreen } from '@/components/auth/TelegramAuthScreen'
import { UpdateModal } from '@/components/ui/UpdateModal'
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
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [displayMode, setDisplayMode] = useState<'compact' | 'standard' | 'expanded'>('standard')
  const [authState, setAuthState] = useState<AuthState>({ checked: false })
  const [taskRefreshKey, setTaskRefreshKey] = useState(0)
  const tabCounts = useTabCounts()

  // Escape is handled by TgSlidePanel itself, including the rule that a stray
  // Escape inside a settings field must not throw the panel away.

  // Show update modal automatically when a new version is available
  useEffect(() => {
    if (!window.electronAPI) return
    const cleanup = window.electronAPI.onUpdatesStateChanged((raw) => {
      const s = raw as { status?: string } | null
      if (s?.status === 'available') setShowUpdateModal(true)
    })
    return cleanup
  }, [])

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
        // Resolve display mode: prefer task_display_mode, fall back to compact_mode legacy
        const mode = s.task_display_mode || (s.compact_mode ? 'compact' : 'standard')
        setDisplayMode(mode as 'compact' | 'standard' | 'expanded')
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
      <TgWindowFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-2xl">⚠️</p>
          <p className="text-tg-box font-semibold text-tg-text-bold">Бэкенд не отвечает</p>
          <p className="text-tg-sm leading-relaxed text-tg-text-sub">
            Python-сервер не запустился за {elapsed}с.<br />
            Убедитесь, что venv создан и зависимости установлены.
          </p>
          <TgButton variant="light" onClick={() => window.location.reload()}>
            Перезапустить
          </TgButton>
        </div>
      </TgWindowFrame>
    )
  }

  // ── Backend loading ───────────────────────────────────────────────────────

  if (!ready) {
    return (
      <TgWindowFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-tg-accent"
                style={{ animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out` }}
              />
            ))}
          </div>
          <p className="text-tg-base text-tg-text-sub">
            {elapsed < 2 ? 'Запуск...' : `Подключение${elapsed > 4 ? ` (${elapsed}с)` : '...'}`}
          </p>
          <style>{`
            @keyframes bounce {
              0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
              40%            { transform: scale(1);   opacity: 1;   }
            }
          `}</style>
        </div>
      </TgWindowFrame>
    )
  }

  // ── Auth status loading ───────────────────────────────────────────────────

  if (!authState.checked) {
    return (
      <TgWindowFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-tg-accent border-t-transparent" />
          <p className="text-tg-sm text-tg-text-sub">Проверка авторизации...</p>
        </div>
      </TgWindowFrame>
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
      <TgWindowFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-2xl">⚡</p>
          <p className="text-tg-box font-semibold text-tg-text-bold">Telegram не подключился</p>
          <p className="text-tg-sm leading-relaxed text-tg-text-sub">
            Сессия найдена, но сервис не запустился.<br />
            Проверьте интернет-соединение и попробуйте ещё раз.
          </p>
          <div className="flex gap-2 pt-1">
            <TgButton onClick={retry}>Повторить</TgButton>
            <TgButton variant="light" onClick={reauth}>Войти заново</TgButton>
          </div>
        </div>
      </TgWindowFrame>
    )
  }

  // ── Full auth wizard ──────────────────────────────────────────────────────
  // session_exists=false → user has never authenticated (or session was lost)

  if (authState.checked && !authState.connected) {
    return (
      <TgWindowFrame>
        <div className="flex flex-1 flex-col overflow-hidden">
          <TelegramAuthScreen
            hasCredentials={authState.hasCredentials}
            onConnected={() =>
              setAuthState({ checked: true, connected: true, hasCredentials: true, sessionExists: true })
            }
          />
        </div>
      </TgWindowFrame>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <TgWindowFrame>
      {/* Update modal — shown automatically when a new version is detected */}
      {showUpdateModal && (
        <UpdateModal onDismiss={() => setShowUpdateModal(false)} />
      )}

      {/* Settings and stats slide in over the list. The list stays mounted so
          the WebSocket and the notification sound keep working; its keyboard
          shortcuts are switched off through overlayOpen. */}
      <TgSlidePanel open={showSettings} onClose={() => setShowSettings(false)}>
        <SettingsScreen
          onClose={() => setShowSettings(false)}
          pinSet={pinSet}
          onPinChanged={onPinChanged}
          onSaved={() => setTaskRefreshKey((k) => k + 1)}
        />
      </TgSlidePanel>

      <TgSlidePanel open={showStats} onClose={() => setShowStats(false)}>
        <StatsScreen onClose={() => setShowStats(false)} />
      </TgSlidePanel>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar
          inboxCount={inboxCount}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStats={() => setShowStats(true)}
        />

        <FilterTabs
          active={tab}
          onChange={setTab}
          counts={{ inbox: inboxCount, done: tabCounts.done, snoozed: tabCounts.snoozed }}
        />

        {/* Content */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TaskList
            tab={tab}
            displayMode={displayMode}
            onInboxCountChange={setInboxCount}
            refreshTrigger={taskRefreshKey}
            overlayOpen={showSettings || showStats}
          />
        </main>
      </div>
    </TgWindowFrame>
  )
}
