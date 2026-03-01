/**
 * Settings screen — replaces main content when active.
 *
 * Sections:
 *  1. Telegram  — mention handles, monitored chats/threads
 *  2. Filters   — ignore own, min text length
 *  3. Reaction  — reaction emoji, reply text, commit delay
 *  4. Cleanup   — auto-delete done tasks, clear all button
 *  5. UI        — sound toggle, compact mode
 */
import { useEffect, useState, useCallback } from 'react'
import {
  ArrowLeft, Loader2, RefreshCw, Plus, X,
  MessageCircle, Filter, ThumbsUp, Trash2, Monitor, RotateCcw, History,
  Terminal, FolderOpen, ShieldCheck,
} from 'lucide-react'
import { getSettings, updateSettings, restartListener, scanHistory } from '@/api/settings'
import { fetchLogs } from '@/api/logs'
import type { LogLevel, LogsResponse } from '@/api/logs'
import { parseLogLines } from '@/lib/log-parser'
import type { FriendlyEntry } from '@/lib/log-parser'
import { setSoundEnabled, setNotificationSound, playPreviewSound, setCustomSoundPath, getCustomSoundPath, SOUND_PRESETS } from '@/lib/sound'
import type { SoundPreset } from '@/lib/sound'
import type { ScanHistoryResult } from '@/api/settings'
import { clearDoneTasks, clearInboxTasks } from '@/api/tasks'
import { setPin } from '@/api/pin'
import { apiFetch } from '@/api/client'
import { getLockTimeoutMinutes, setLockTimeoutMinutes } from '@/hooks/usePinGuard'
import type { AppSettings } from '@/types/settings'
import { ThreadSelector } from './ThreadSelector'
import { cn } from '@/lib/utils'
import { nativeConfirm } from '@/lib/dialog'

interface GuardCheckResult {
  ok: boolean
  checked: number
  ok_count: number
  rolled_back: number
  skipped: number
}

// ── Valid Telegram reaction emojis ────────────────────────────────────────────
const REACTION_OPTIONS = ['👍', '❤', '🔥', '🎉', '👏', '🤝', '💯', '✍']

// ── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors',
        checked ? 'bg-indigo-500' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

// ── Row: label + control ─────────────────────────────────────────────────────

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}



// ── Multi-tag input ───────────────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const [input, setInput] = useState('')

  const addTag = () => {
    const tag = input.trim()
    if (!tag) return
    const formatted = tag.startsWith('@') ? tag : `@${tag}`
    if (!tags.includes(formatted)) {
      onChange([...tags, formatted].join(','))
    }
    setInput('')
  }

  const removeTag = (t: string) => {
    onChange(tags.filter((x) => x !== t).join(','))
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[12px] text-indigo-300"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="text-indigo-400 hover:text-indigo-200">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
          placeholder={placeholder ?? '@тег'}
          className="w-24 rounded-md border border-border/50 bg-background px-2 py-0.5 text-[12px] outline-none focus:border-indigo-500"
        />
        <button
          onClick={addTag}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/40"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [clearingDone, setClearingDone] = useState(false)
  const [clearingInbox, setClearingInbox] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanHistoryResult | null>(null)
  const [scanHours, setScanHours] = useState(8)
  const [scanError, setScanError] = useState<string | null>(null)
  const [guardChecking, setGuardChecking] = useState(false)
  const [guardResult, setGuardResult] = useState<GuardCheckResult | null>(null)
  const [guardError, setGuardError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // Logs state
  const [logsData, setLogsData] = useState<LogsResponse | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsLevel, setLogsLevel] = useState<LogLevel>('ALL')
  const [logsLines, setLogsLines] = useState(200)
  const [logsMode, setLogsMode] = useState<'friendly' | 'raw'>('friendly')

  // PIN / Security state
  const [pinCurrentInput, setPinCurrentInput] = useState('')
  const [pinNewInput, setPinNewInput] = useState('')
  const [pinConfirmInput, setPinConfirmInput] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState<string | null>(null)
  const [lockMinutes, setLockMinutes] = useState(() => getLockTimeoutMinutes())

  // Load app version once
  useEffect(() => {
    void window.electronAPI?.getVersion().then(setAppVersion)
  }, [])

  const loadSettings = useCallback(() => {
    setLoadError(null)
    getSettings()
      .then(setSettings)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Failed to load settings:', msg)
        setLoadError(msg)
      })
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])



  const patch = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev)
  }, [])

  const save = useCallback(async () => {
    if (!settings) return
    setSaving(true)
    try {
      const updated = await updateSettings(settings)
      setSettings(updated)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      onSaved?.()
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }, [settings, onSaved])

  /** Save settings AND restart the Telethon listener (for chat/thread changes) */
  const saveAndRestart = useCallback(async () => {
    if (!settings) return
    setRestarting(true)
    try {
      const updated = await updateSettings(settings)
      setSettings(updated)
      await restartListener()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
      onSaved?.()
    } catch (err) {
      console.error('Failed to save & restart:', err)
    } finally {
      setRestarting(false)
    }
  }, [settings, onSaved])



  const handleScanHistory = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    try {
      const result = await scanHistory(scanHours)
      setScanResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setScanError(msg)
    } finally {
      setScanning(false)
    }
  }, [scanHours])

  const handleGuardCheck = useCallback(async () => {
    setGuardChecking(true)
    setGuardResult(null)
    setGuardError(null)
    try {
      const res = await apiFetch<GuardCheckResult>('/telegram/guard-check?hours=72&batch=300', {
        method: 'POST',
      })
      setGuardResult(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setGuardError(msg)
    } finally {
      setGuardChecking(false)
    }
  }, [])

  const handleLoadLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      // Friendly mode: load 300 raw lines (parser discards noise, needs headroom)
      // Raw mode: use user-selected lines + level
      const res = await fetchLogs(
        logsMode === 'friendly' ? 300 : logsLines,
        logsMode === 'friendly' ? 'ALL' : logsLevel,
      )
      setLogsData(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLogsError(msg)
    } finally {
      setLogsLoading(false)
    }
  }, [logsLines, logsLevel, logsMode])

  const handleClearDone = useCallback(async () => {
    const ok = await nativeConfirm('Удалить все выполненные задачи?')
    if (!ok) return
    setClearingDone(true)
    try {
      const res = await clearDoneTasks()
      alert(`Удалено ${res.deleted} задач`)
    } catch {
      alert('Ошибка очистки')
    } finally {
      setClearingDone(false)
    }
  }, [])

  const handleClearInbox = useCallback(async () => {
    const ok = await nativeConfirm(
      'Очистить ВСЕ задачи во вкладке Inbox?\n\nЭто удалит только локальные задачи в приложении (без действий в Telegram).'
    )
    if (!ok) return

    setClearingInbox(true)
    try {
      const res = await clearInboxTasks()
      alert(`Удалено ${res.deleted} задач из inbox`)
    } catch {
      alert('Ошибка очистки inbox')
    } finally {
      setClearingInbox(false)
    }
  }, [])



  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="relative flex h-11 flex-shrink-0 items-center gap-2 border-b border-border/50 bg-background/60 pl-3 pr-[120px] backdrop-blur-md"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* no-drag cutout for WindowControls zone (right 120px) — same pattern as TopBar */}
        <div
          className="absolute right-0 top-0 h-full w-[120px]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />

        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm font-semibold">Настройки</span>

        {/* Save buttons */}
        <div
          className="ml-auto flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Quick save — no listener restart */}
          <button
            onClick={save}
            disabled={saving || restarting || !settings}
            className={cn(
              'rounded-lg px-3 py-1 text-[12px] font-semibold transition-colors',
              savedFlash
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30',
              'disabled:opacity-50',
            )}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : savedFlash ? '✓ Ok' : 'Сохранить'}
          </button>

          {/* Save + restart listener (required after changing chats) */}
          <button
            onClick={saveAndRestart}
            disabled={saving || restarting || !settings}
            title="Сохранить настройки и перезапустить слушатель чатов"
            className="flex items-center gap-1 rounded-lg border border-amber-500/30 px-2 py-1 text-[12px] text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          >
            {restarting
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RotateCcw className="h-3 w-3" />}
            Применить
          </button>
        </div>
      </div>

      {/* Body */}
      {loadError !== null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-muted-foreground">Не удалось загрузить настройки</p>
          {/* Show the raw error so it's easy to diagnose */}
          <p className="max-w-[280px] break-all rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-mono text-red-400">
            {loadError || 'Unknown error'}
          </p>
          <button
            onClick={loadSettings}
            className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Повторить
          </button>
        </div>
      ) : !settings ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">

          {/* ── 1. Telegram ─────────────────────────────────────────────── */}
          <Section icon={<MessageCircle className="h-4 w-4" />} title="Telegram">
            <div>
              <p className="mb-0.5 text-[12px] text-muted-foreground">Мой Telegram handle</p>
              <p className="mb-1.5 text-[11px] text-muted-foreground/60">
                Задачи создаются только для сообщений, где упомянут ваш @тег
              </p>
              <TagInput
                value={settings.tg_mention_handles}
                onChange={(v) => patch('tg_mention_handles', v)}
                placeholder="@username"
              />
            </div>

            <div>
              <p className="mb-1.5 text-[12px] text-muted-foreground">Отслеживаемые чаты и ветки</p>
              <ThreadSelector
                monitoredChatIds={settings.tg_monitored_chat_ids}
                monitoredThreadIds={settings.tg_monitored_thread_ids}
                onChatIdsChange={(v) => patch('tg_monitored_chat_ids', v)}
                onThreadIdsChange={(v) => patch('tg_monitored_thread_ids', v)}
              />
            </div>

            {/* Hint about restart */}
            <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-400">
              ⚡ После изменения чатов нажмите <strong>Применить</strong> — это перезапустит слушатель.
            </p>
          </Section>

          {/* ── 2. Filters ──────────────────────────────────────────────── */}
          <Section icon={<Filter className="h-4 w-4" />} title="Фильтры">
            <Row label="Игнорировать свои сообщения">
              <Toggle
                checked={settings.filter_ignore_own}
                onChange={(v) => patch('filter_ignore_own', v)}
              />
            </Row>
            <Row label="Минимальная длина текста" hint={`Сейчас: ${settings.filter_min_text_length} симв.`}>
              <input
                type="number"
                min={0}
                max={2000}
                value={settings.filter_min_text_length}
                onChange={(e) => patch('filter_min_text_length', Number(e.target.value))}
                className="w-16 rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-center outline-none focus:border-indigo-500"
              />
            </Row>

            <Row label="Порядок задач в inbox">
              <div className="flex overflow-hidden rounded-md border border-border/50">
                <button
                  onClick={() => patch('tasks_inbox_sort_direction', 'desc')}
                  className={cn(
                    'border-r border-border/50 px-2.5 py-1 text-[11px] transition-colors',
                    settings.tasks_inbox_sort_direction !== 'asc'
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Новые сверху
                </button>
                <button
                  onClick={() => patch('tasks_inbox_sort_direction', 'asc')}
                  className={cn(
                    'px-2.5 py-1 text-[11px] transition-colors',
                    settings.tasks_inbox_sort_direction === 'asc'
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Новые снизу
                </button>
              </div>
            </Row>

            <Row label="Высокий приоритет выше" hint="Сначала HIGH, потом MED, LOW, NORM">
              <Toggle
                checked={settings.tasks_inbox_sort_by_priority}
                onChange={(v) => patch('tasks_inbox_sort_by_priority', v)}
              />
            </Row>
          </Section>

          {/* ── 3. Reaction ─────────────────────────────────────────────── */}
          <Section icon={<ThumbsUp className="h-4 w-4" />} title="Реакция на выполнение">
            <div>
              <p className="mb-1.5 text-[12px] text-muted-foreground">Реакция</p>
              <div className="flex flex-wrap gap-1.5">
                {REACTION_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => patch('done_reaction', emoji)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg border text-lg transition-colors',
                      settings.done_reaction === emoji
                        ? 'border-indigo-500 bg-indigo-500/20'
                        : 'border-border/50 hover:border-border',
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <Row label="Отправлять ответ в чат">
              <Toggle
                checked={settings.done_send_reply}
                onChange={(v) => patch('done_send_reply', v)}
              />
            </Row>

            {settings.done_send_reply && (
              <div>
                <p className="mb-1 text-[12px] text-muted-foreground">Текст ответа</p>
                <input
                  value={settings.done_reply_text}
                  onChange={(e) => patch('done_reply_text', e.target.value)}
                  className="w-full rounded-md border border-border/50 bg-background px-2 py-1 text-[13px] outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <Row label="Задержка реакции" hint={`${settings.done_commit_delay_seconds} сек — время на отмену`}>
              <input
                type="range"
                min={0}
                max={60}
                value={settings.done_commit_delay_seconds}
                onChange={(e) => patch('done_commit_delay_seconds', Number(e.target.value))}
                className="w-24 accent-indigo-500"
              />
            </Row>
          </Section>

          {/* ── 4. Cleanup ──────────────────────────────────────────────── */}
          <Section icon={<Trash2 className="h-4 w-4" />} title="Очистка">
            <Row
              label="Авто-удаление выполненных"
              hint={settings.cleanup_done_after_days === 0 ? 'Выключено' : `Через ${settings.cleanup_done_after_days} дн.`}
            >
              <input
                type="number"
                min={0}
                max={365}
                value={settings.cleanup_done_after_days}
                onChange={(e) => patch('cleanup_done_after_days', Number(e.target.value))}
                className="w-16 rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-center outline-none focus:border-indigo-500"
              />
            </Row>
            <Row label="Удалить все выполненные сейчас">
              <button
                onClick={handleClearDone}
                disabled={clearingDone}
                className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1 text-[12px] text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {clearingDone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Очистить
              </button>
            </Row>
            <Row label="Аварийная очистка inbox" hint="Удалит только локальные inbox-задачи">
              <button
                onClick={handleClearInbox}
                disabled={clearingInbox}
                className="flex items-center gap-1 rounded-lg border border-amber-500/30 px-3 py-1 text-[12px] text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
              >
                {clearingInbox ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Очистить inbox
              </button>
            </Row>
          </Section>

          {/* ── 5. Catch-up scan ────────────────────────────────────────── */}
          <Section icon={<History className="h-4 w-4" />} title="Сканирование истории">
            <Row
              label="Авто-скан при запуске"
              hint={settings.catchup_hours === 0 ? 'Выключено' : `Последние ${settings.catchup_hours} ч`}
            >
              <input
                type="number"
                min={0}
                max={168}
                value={settings.catchup_hours}
                onChange={(e) => patch('catchup_hours', Number(e.target.value))}
                className="w-16 rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-center outline-none focus:border-indigo-500"
              />
            </Row>

            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-muted-foreground">Ручной скан истории</p>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">За последние</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={scanHours}
                  onChange={(e) => setScanHours(Math.max(1, Math.min(168, Number(e.target.value))))}
                  className="w-16 rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-center outline-none focus:border-indigo-500"
                />
                <span className="text-[12px] text-muted-foreground">ч</span>
                <button
                  onClick={handleScanHistory}
                  disabled={scanning}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 px-3 py-1 text-[12px] text-indigo-400 transition-colors hover:bg-indigo-500/10 disabled:opacity-50"
                >
                  {scanning
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <History className="h-3 w-3" />}
                  Сканировать
                </button>
              </div>

              {scanResult && (
                <div className={cn(
                  'rounded-lg px-3 py-2 text-[11px]',
                  scanResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
                )}>
                  {scanResult.ok
                    ? `Просмотрено: ${scanResult.scanned} · Создано: ${scanResult.created} · Уже выполнено: ${scanResult.skipped_done} · Дубли: ${scanResult.skipped_dup}`
                    : 'Ошибка сканирования'}
                </div>
              )}
              {scanError && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
                  Ошибка: {scanError}
                </div>
              )}
            </div>

            <div className="mt-2 rounded-lg border border-border/40 bg-background/30 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] text-muted-foreground">Проверка guard</p>
                <button
                  onClick={handleGuardCheck}
                  disabled={guardChecking}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1 text-[12px] text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                >
                  {guardChecking
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RotateCcw className="h-3 w-3" />}
                  Guard
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Что делает: проверяет, что реакции/ответы стоят только на сообщениях с твоим тегом; неверные реакции снимает и удаляет наш reply.
              </p>

              {guardResult && (
                <div className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-400">
                  Проверено: {guardResult.checked} · Ок: {guardResult.ok_count} · Откат: {guardResult.rolled_back} · Пропущено: {guardResult.skipped}
                </div>
              )}
              {guardError && (
                <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
                  Ошибка guard: {guardError}
                </div>
              )}
            </div>
          </Section>

          {/* ── 6. Безопасность ──────────────────────────────────────── */}
          <Section icon={<ShieldCheck className="h-4 w-4" />} title="Безопасность">
            {pinSet ? (
              <>
                <Row label="PIN-код" hint="Защита доступа к приложению и Telegram-сессии">
                  <span className="rounded-md bg-green-500/10 px-2 py-0.5 text-[11px] text-green-400">
                    Установлен
                  </span>
                </Row>

                {/* Change PIN */}
                <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                  <p className="text-[12px] font-medium text-foreground">Сменить PIN</p>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Текущий PIN"
                    value={pinCurrentInput}
                    onChange={(e) => {
                      setPinCurrentInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      setPinError(null)
                      setPinSuccess(null)
                    }}
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Новый PIN (4-6 цифр)"
                    value={pinNewInput}
                    onChange={(e) => {
                      setPinNewInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      setPinError(null)
                      setPinSuccess(null)
                    }}
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Повторите новый PIN"
                    value={pinConfirmInput}
                    onChange={(e) => {
                      setPinConfirmInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      setPinError(null)
                      setPinSuccess(null)
                    }}
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  />
                  <button
                    disabled={pinSaving || pinNewInput.length < 4 || !pinCurrentInput}
                    onClick={async () => {
                      if (pinNewInput !== pinConfirmInput) {
                        setPinError('Новый PIN не совпадает с подтверждением')
                        return
                      }
                      setPinSaving(true)
                      setPinError(null)
                      try {
                        await setPin(pinNewInput, pinCurrentInput)
                        setPinSuccess('PIN изменён')
                        setPinCurrentInput('')
                        setPinNewInput('')
                        setPinConfirmInput('')
                        onPinChanged?.()
                      } catch {
                        setPinError('Неверный текущий PIN')
                      } finally {
                        setPinSaving(false)
                      }
                    }}
                    className="rounded-md bg-indigo-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
                  >
                    {pinSaving ? 'Сохранение...' : 'Сменить PIN'}
                  </button>
                  {pinError && <p className="text-[11px] text-red-400">{pinError}</p>}
                  {pinSuccess && <p className="text-[11px] text-green-400">{pinSuccess}</p>}
                </div>
              </>
            ) : (
              <>
                <Row label="PIN-код" hint="Защита доступа к приложению и Telegram-сессии">
                  <span className="rounded-md bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-400">
                    Не установлен
                  </span>
                </Row>

                {/* Set PIN */}
                <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                  <p className="text-[12px] font-medium text-foreground">Установить PIN</p>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="PIN (4-6 цифр)"
                    value={pinNewInput}
                    onChange={(e) => {
                      setPinNewInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      setPinError(null)
                      setPinSuccess(null)
                    }}
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Повторите PIN"
                    value={pinConfirmInput}
                    onChange={(e) => {
                      setPinConfirmInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      setPinError(null)
                      setPinSuccess(null)
                    }}
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-1.5 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  />
                  <button
                    disabled={pinSaving || pinNewInput.length < 4}
                    onClick={async () => {
                      if (pinNewInput !== pinConfirmInput) {
                        setPinError('PIN не совпадает с подтверждением')
                        return
                      }
                      setPinSaving(true)
                      setPinError(null)
                      try {
                        await setPin(pinNewInput)
                        setPinSuccess('PIN установлен! При следующем запуске потребуется ввод PIN')
                        setPinNewInput('')
                        setPinConfirmInput('')
                        onPinChanged?.()
                      } catch {
                        setPinError('Ошибка установки PIN')
                      } finally {
                        setPinSaving(false)
                      }
                    }}
                    className="rounded-md bg-indigo-500 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
                  >
                    {pinSaving ? 'Сохранение...' : 'Установить PIN'}
                  </button>
                  {pinError && <p className="text-[11px] text-red-400">{pinError}</p>}
                  {pinSuccess && <p className="text-[11px] text-green-400">{pinSuccess}</p>}
                </div>
              </>
            )}

            <Row label="Автоблокировка" hint="Через сколько минут без действий запрашивать PIN (0 = выкл)">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={lockMinutes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setLockMinutes(v)
                    setLockTimeoutMinutes(v)
                  }}
                  className="h-1.5 w-24 cursor-pointer accent-indigo-500"
                />
                <span className="min-w-[3rem] text-right text-[12px] text-muted-foreground">
                  {lockMinutes === 0 ? 'Выкл' : `${lockMinutes} мин`}
                </span>
              </div>
            </Row>
          </Section>

          {/* ── 7. UI ────────────────────────────────────────────────────── */}
          <Section icon={<Monitor className="h-4 w-4" />} title="Внешний вид">
            <Row label="Системные уведомления" hint="Всплывающие тосты Windows">
              <Toggle
                checked={settings.notifications_enabled}
                onChange={(v) => {
                  patch('notifications_enabled', v)
                  window.electronAPI?.setNotificationsEnabled(v)
                }}
              />
            </Row>
            <Row label="Звук уведомлений" hint="Только если уведомления включены">
              <Toggle
                checked={settings.sound_enabled}
                onChange={(v) => {
                  patch('sound_enabled', v)
                  setSoundEnabled(v)
                  // Electron notification stays silent — sound handled in renderer
                  window.electronAPI?.setSoundEnabled(false)
                }}
              />
            </Row>
            {settings.sound_enabled && (
              <Row label="Пресет звука">
                <div className="flex items-center gap-1.5">
                  <select
                    value={settings.notification_sound}
                    onChange={(e) => {
                      const preset = e.target.value as SoundPreset
                      patch('notification_sound', preset)
                      setNotificationSound(preset)
                    }}
                    className="rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  >
                    {(Object.entries(SOUND_PRESETS) as [SoundPreset, typeof SOUND_PRESETS[SoundPreset]][]).map(
                      ([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label} — {meta.description}
                        </option>
                      )
                    )}
                  </select>
                  <button
                    onClick={() => playPreviewSound(settings.notification_sound as SoundPreset)}
                    title="Проиграть выбранный звук"
                    className="rounded-md border border-border/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    ▶
                  </button>
                </div>
              </Row>
            )}
            {settings.sound_enabled && settings.notification_sound === 'custom' && (
              <Row label="Путь к файлу" hint="MP3 или OGG, например: /sounds/my.mp3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    defaultValue={getCustomSoundPath() ?? ''}
                    placeholder="/sounds/custom.mp3"
                    onBlur={(e) => {
                      const val = e.target.value.trim() || null
                      setCustomSoundPath(val)
                    }}
                    className="w-48 rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:border-indigo-500 placeholder:text-muted-foreground/40"
                  />
                  <button
                    onClick={() => playPreviewSound('custom')}
                    title="Проиграть кастомный звук"
                    className="rounded-md border border-border/50 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    ▶
                  </button>
                </div>
              </Row>
            )}
            <Row label="Компактный режим" hint="Меньше деталей, больше задач">
              <Toggle
                checked={settings.compact_mode}
                onChange={(v) => patch('compact_mode', v)}
              />
            </Row>
          </Section>

          {/* ── 7. Диагностика ──────────────────────────────────────────── */}
          <Section icon={<Terminal className="h-4 w-4" />} title="Диагностика">

            {/* ── Controls row ── */}
            <div className="flex flex-wrap items-center gap-2">

              {/* Mode toggle: Понятный / Технический */}
              <div className="flex overflow-hidden rounded-lg border border-border/50 text-[12px]">
                <button
                  onClick={() => setLogsMode('friendly')}
                  className={cn(
                    'px-2.5 py-1 transition-colors',
                    logsMode === 'friendly'
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Понятный
                </button>
                <button
                  onClick={() => setLogsMode('raw')}
                  className={cn(
                    'border-l border-border/50 px-2.5 py-1 transition-colors',
                    logsMode === 'raw'
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Технический
                </button>
              </div>

              {/* Raw-only controls */}
              {logsMode === 'raw' && (
                <>
                  <select
                    value={logsLevel}
                    onChange={(e) => setLogsLevel(e.target.value as LogLevel)}
                    className="rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  >
                    <option value="ALL">Все уровни</option>
                    <option value="ERROR">Только ошибки</option>
                    <option value="WARNING">Предупреждения</option>
                    <option value="INFO">INFO</option>
                  </select>
                  <select
                    value={logsLines}
                    onChange={(e) => setLogsLines(Number(e.target.value))}
                    className="rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] text-foreground outline-none focus:border-indigo-500"
                  >
                    <option value={50}>50 строк</option>
                    <option value={100}>100 строк</option>
                    <option value={200}>200 строк</option>
                    <option value={500}>500 строк</option>
                  </select>
                </>
              )}

              {/* Load / Refresh */}
              <button
                onClick={handleLoadLogs}
                disabled={logsLoading}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 px-3 py-1 text-[12px] text-indigo-400 transition-colors hover:bg-indigo-500/10 disabled:opacity-50"
              >
                {logsLoading
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />}
                {logsData ? 'Обновить' : 'Загрузить'}
              </button>

              {/* Open folder (Electron only) */}
              {window.electronAPI && (
                <button
                  onClick={() => window.electronAPI?.openLogsFolder()}
                  title="Открыть папку с логами в Проводнике"
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  <FolderOpen className="h-3 w-3" />
                  Папка логов
                </button>
              )}
            </div>

            {/* Error */}
            {logsError && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
                Ошибка: {logsError}
              </p>
            )}

            {/* ── Friendly output ── */}
            {logsData && logsMode === 'friendly' && (() => {
              const entries: FriendlyEntry[] = parseLogLines(logsData.lines)
              if (entries.length === 0) {
                return (
                  <p className="text-[11px] text-muted-foreground">
                    Нет событий для отображения. Попробуй «Технический» режим для деталей.
                  </p>
                )
              }
              return (
                <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
                  {entries.map((e, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px]',
                        e.isError   ? 'bg-red-500/10'
                        : e.isWarning ? 'bg-amber-500/10'
                        : 'bg-background/40 hover:bg-accent/40',
                      )}
                    >
                      {/* Icon */}
                      <span className="flex-shrink-0 text-[13px] leading-[1.4]">{e.icon}</span>
                      {/* Text */}
                      <span
                        className={cn(
                          'min-w-0 flex-1 leading-[1.5]',
                          e.isError   ? 'text-red-400'
                          : e.isWarning ? 'text-amber-400'
                          : 'text-foreground',
                        )}
                      >
                        {e.text}
                      </span>
                      {/* Time badge */}
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">
                        {e.time}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* ── Raw (technical) output ── */}
            {logsData && logsMode === 'raw' && (
              logsData.lines.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Лог пуст или нет строк выбранного уровня.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border/40 bg-background">
                  <div className="flex items-center justify-between border-b border-border/30 px-2 py-1">
                    <span className="text-[10px] text-muted-foreground/60">{logsData.file}</span>
                    <span className="text-[10px] text-muted-foreground/60">{logsData.total_lines} строк</span>
                  </div>
                  <pre className="max-h-64 overflow-y-auto p-2 text-[10px] leading-[1.6] font-mono whitespace-pre-wrap break-all">
                    {logsData.lines.map((line, i) => (
                      <span
                        key={i}
                        className={cn(
                          'block',
                          line.includes('ERROR')   ? 'text-red-400'
                          : line.includes('WARNING') ? 'text-amber-400'
                          : 'text-muted-foreground',
                        )}
                      >
                        {line}
                      </span>
                    ))}
                  </pre>
                </div>
              )
            )}

          </Section>

          {/* ── Footer: version ──────────────────────────────────────────── */}
          {appVersion && (
            <p className="text-center text-[10px] text-muted-foreground/40">
              TG Focus Filter v{appVersion}
            </p>
          )}

        </div>
      )}
    </div>
  )
}
