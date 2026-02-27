/**
 * Settings screen — replaces main content when active.
 *
 * Sections:
 *  1. Telegram  — mention handles, monitored chats/threads
 *  2. Filters   — ignore own, min text length, strict mentions
 *  3. Reaction  — reaction emoji, reply text, commit delay
 *  4. Cleanup   — auto-delete done tasks, clear all button
 *  5. UI        — sound toggle, compact mode
 */
import { useEffect, useState, useCallback } from 'react'
import {
  ArrowLeft, Loader2, RefreshCw, Plus, X,
  MessageCircle, Filter, ThumbsUp, Trash2, Monitor, RotateCcw,
} from 'lucide-react'
import { getSettings, updateSettings, getTgChats, getTgThreads, restartListener } from '@/api/settings'
import { clearDoneTasks } from '@/api/tasks'
import type { AppSettings, TgChat, TgThread } from '@/types/settings'
import { cn } from '@/lib/utils'

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

// ── Chat selector ─────────────────────────────────────────────────────────────

function ChatSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [chats, setChats] = useState<TgChat[]>([])
  const [loading, setLoading] = useState(false)

  const selected = value.split(',').map((s) => s.trim()).filter(Boolean)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getTgChats()
      setChats(list)
    } catch {
      // keep empty
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id]
    onChange(next.join(','))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {selected.length > 0 ? `Выбрано: ${selected.length}` : 'Не выбрано — слушать все'}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {loading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />}
          Обновить
        </button>
      </div>

      {chats.length === 0 && !loading && (
        <p className="text-[11px] text-muted-foreground">
          Нет данных — Telegram должен быть подключён
        </p>
      )}

      <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
        {chats.map((chat) => {
          const isSelected = selected.includes(chat.id)
          return (
            <button
              key={chat.id}
              onClick={() => toggle(chat.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors',
                isSelected
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span className={cn(
                'h-4 w-4 flex-shrink-0 rounded border text-center text-[10px] leading-[14px]',
                isSelected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-border',
              )}>
                {isSelected ? '✓' : ''}
              </span>
              <span className="min-w-0 flex-1 truncate">{chat.name}</span>
              <span className="text-[10px] text-muted-foreground/60">{chat.type}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export function SettingsScreen({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [clearingDone, setClearingDone] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [threads, setThreads] = useState<TgThread[]>([])
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [threadsLoaded, setThreadsLoaded] = useState(false)
  const [threadsError, setThreadsError] = useState<string | null>(null)

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
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }, [settings])

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
    } catch (err) {
      console.error('Failed to save & restart:', err)
    } finally {
      setRestarting(false)
    }
  }, [settings])

  /** Load threads for the first selected chat */
  const loadThreads = useCallback(async () => {
    if (!settings) return
    const firstChat = settings.tg_monitored_chat_ids.split(',').map(s => s.trim()).filter(Boolean)[0]
    if (!firstChat) {
      setThreadsError('Сначала выберите хотя бы один чат')
      return
    }
    setLoadingThreads(true)
    setThreadsError(null)
    try {
      const list = await getTgThreads(firstChat)
      setThreads(list)
      setThreadsLoaded(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setThreadsError(msg)
      setThreads([])
    } finally {
      setLoadingThreads(false)
    }
  }, [settings])

  const handleClearDone = useCallback(async () => {
    if (!confirm('Удалить все выполненные задачи?')) return
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-border/50 bg-background/60 pl-3 pr-[120px] backdrop-blur-md"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
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
              <p className="mb-1.5 text-[12px] text-muted-foreground">Теги упоминания</p>
              <TagInput
                value={settings.tg_mention_handles}
                onChange={(v) => patch('tg_mention_handles', v)}
                placeholder="@тег"
              />
            </div>

            <div>
              <p className="mb-1.5 text-[12px] text-muted-foreground">Отслеживаемые чаты</p>
              <ChatSelector
                value={settings.tg_monitored_chat_ids}
                onChange={(v) => patch('tg_monitored_chat_ids', v)}
              />
            </div>

            {/* Thread selector — loads topics of the first selected chat */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[12px] text-muted-foreground">Ветки / темы (опционально)</p>
                <button
                  onClick={loadThreads}
                  disabled={loadingThreads}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {loadingThreads
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3" />}
                  Загрузить
                </button>
              </div>

              {threadsError && (
                <p className="rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
                  {threadsError}
                </p>
              )}
              {!threadsError && !threadsLoaded ? (
                <p className="text-[11px] text-muted-foreground">
                  Нажмите «Загрузить» чтобы получить ветки первого выбранного чата.<br />
                  Оставьте пустым — слушать все ветки.
                </p>
              ) : !threadsError && threadsLoaded && threads.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Чат не является форумом или тем нет. Слушаем все сообщения.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {threads.map((thread) => {
                    const selected = settings.tg_monitored_thread_ids
                      .split(',').map(s => s.trim()).filter(Boolean)
                    const isSelected = selected.includes(thread.id)
                    const toggle = () => {
                      const next = isSelected
                        ? selected.filter(x => x !== thread.id)
                        : [...selected, thread.id]
                      patch('tg_monitored_thread_ids', next.join(','))
                    }
                    return (
                      <button
                        key={thread.id}
                        onClick={toggle}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors',
                          isSelected
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <span className={cn(
                          'h-4 w-4 flex-shrink-0 rounded border text-center text-[10px] leading-[14px]',
                          isSelected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-border',
                        )}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <span className="truncate">{thread.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/50">#{thread.id}</span>
                      </button>
                    )
                  })}
                </div>
              )}
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
            <Row label="Только сообщения с упоминанием" hint="Игнорировать без @тега">
              <Toggle
                checked={settings.filter_strict_mentions}
                onChange={(v) => patch('filter_strict_mentions', v)}
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
                max={30}
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
          </Section>

          {/* ── 5. UI ────────────────────────────────────────────────────── */}
          <Section icon={<Monitor className="h-4 w-4" />} title="Внешний вид">
            <Row label="Звук уведомлений">
              <Toggle
                checked={settings.sound_enabled}
                onChange={(v) => {
                  patch('sound_enabled', v)
                  window.electronAPI?.setSoundEnabled(v)
                }}
              />
            </Row>
            <Row label="Компактный режим" hint="Меньше деталей, больше задач">
              <Toggle
                checked={settings.compact_mode}
                onChange={(v) => patch('compact_mode', v)}
              />
            </Row>
          </Section>

        </div>
      )}
    </div>
  )
}
