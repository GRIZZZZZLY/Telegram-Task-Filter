/**
 * TaskDetailModal — полный вид задачи в модальном оверлее.
 *
 * Показывает:
 *  - Полный текст сообщения (прокручиваемый)
 *  - Кто написал (sender_username или sender_id)
 *  - Чат / тема
 *  - Дата и время
 *  - Все действия (Done, Snooze, Dismiss, Reopen, Priority, Open in TG)
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ExternalLink, Check, RotateCcw, Clock, ChevronDown, User,
  MessageSquare, Hash,
} from 'lucide-react'
import type { Task, TaskPriority } from '@/types/task'
import { parsePeerReactions } from '@/types/task'
import { cn } from '@/lib/utils'
import { stripAllMentions } from '@/lib/text'
import { parseBackendDate, withDeviceTimeZone } from '@/lib/date'

// ── Priority config (shared style) ───────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; bar: string; badge: string; badgeBg: string }> = {
  normal: { label: 'NORM', bar: 'bg-slate-500',   badge: 'text-slate-400',  badgeBg: 'bg-slate-500/10 border-slate-500/20' },
  high:   { label: 'HIGH', bar: 'bg-red-500',     badge: 'text-red-400',    badgeBg: 'bg-red-500/10 border-red-500/20' },
  medium: { label: 'MED',  bar: 'bg-amber-500',   badge: 'text-amber-400',  badgeBg: 'bg-amber-500/10 border-amber-500/20' },
  low:    { label: 'LOW',  bar: 'bg-emerald-500', badge: 'text-emerald-400',badgeBg: 'bg-emerald-500/10 border-emerald-500/20' },
}

const PRIORITY_CYCLE: TaskPriority[] = ['normal', 'high', 'medium', 'low']

// ── Snooze options ────────────────────────────────────────────────────────────

function minutesUntilTomorrow9am(): number {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return Math.ceil((tomorrow.getTime() - now.getTime()) / 60_000)
}

const SNOOZE_OPTIONS = [
  { label: '1 час',        minutes: () => 60 },
  { label: '3 часа',       minutes: () => 180 },
  { label: 'Завтра утром', minutes: minutesUntilTomorrow9am },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFullDate(iso: string): string {
  const d = parseBackendDate(iso)
  return d.toLocaleString('ru-RU', withDeviceTimeZone({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }))
}

function buildTgLinks(chatId: string, messageId: number): { deep: string; web: string } {
  const num = parseInt(chatId, 10)
  if (!isNaN(num) && num < 0) {
    const cleanId = String(Math.abs(num)).replace(/^100/, '')
    return {
      deep: `tg://privatepost?channel=${cleanId}&post=${messageId}`,
      web: `https://t.me/c/${cleanId}/${messageId}`,
    }
  }
  if (!isNaN(num)) {
    return {
      deep: `https://t.me/${chatId}/${messageId}`,
      web: `https://t.me/${chatId}/${messageId}`,
    }
  }
  const normalized = chatId.replace(/^@/, '')
  return {
    deep: `tg://resolve?domain=${normalized}&post=${messageId}`,
    web: `https://t.me/${normalized}/${messageId}`,
  }
}

const URL_SPLIT_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
const URL_CHECK_RE = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i

function splitTrailingPunctuation(token: string): { core: string; trailing: string } {
  let core = token
  let trailing = ''
  while (core && /[),.;!?]$/.test(core)) {
    trailing = core.slice(-1) + trailing
    core = core.slice(0, -1)
  }
  return { core, trailing }
}

function renderLinkifiedText(text: string, keyPrefix: string) {
  const chunks = text.split(URL_SPLIT_RE)
  return chunks.map((chunk, idx) => {
    if (!URL_CHECK_RE.test(chunk)) {
      return <span key={`${keyPrefix}-${idx}`}>{chunk}</span>
    }

    const { core, trailing } = splitTrailingPunctuation(chunk)
    if (!core) return <span key={`${keyPrefix}-${idx}`}>{chunk}</span>

    const href = core.startsWith('www.') ? `https://${core}` : core
    return (
      <span key={`${keyPrefix}-${idx}`}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-all underline decoration-dotted underline-offset-2 text-indigo-300 hover:text-indigo-200"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.electronAPI?.openExternal(href)
          }}
        >
          {core}
        </a>
        {trailing}
      </span>
    )
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  task: Task | null
  chatNames?: Map<string, string>
  threadNames?: Map<string, string>
  loadingId: number | null
  onClose: () => void
  onDone: (id: number) => void
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onReopen: (id: number) => void
  onPriorityChange: (id: number, priority: TaskPriority) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskDetailModal({
  task,
  chatNames,
  threadNames,
  loadingId,
  onClose,
  onDone,
  onDismiss,
  onSnooze,
  onReopen,
  onPriorityChange,
}: Props) {
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const snoozeRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!task) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [task, onClose])

  // Close snooze dropdown on outside click
  useEffect(() => {
    if (!snoozeOpen) return
    const handler = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [snoozeOpen])

  const handlePriorityClick = () => {
    if (!task) return
    if (task.status === 'done' || task.status === 'snoozed') return
    const idx = PRIORITY_CYCLE.indexOf(task.priority)
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]
    onPriorityChange(task.id, next)
  }

  return createPortal(
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Modal panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'fixed inset-x-3 top-12 bottom-3 z-50 flex flex-col',
              'rounded-2xl border border-border/50 bg-card shadow-2xl',
              'overflow-hidden',
            )}
          >
            {/* ── Priority accent bar ──────────────────────────────────────── */}
            <div className={cn('h-1 w-full flex-shrink-0', PRIORITY_CONFIG[task.priority].bar)} />

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-start gap-2 px-4 py-3 border-b border-border/30">
              {/* Priority badge (clickable) */}
              <button
                onClick={handlePriorityClick}
                disabled={task.status !== 'inbox'}
                title={task.status === 'inbox' ? 'Сменить приоритет' : undefined}
                className={cn(
                  'mt-0.5 flex-shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider transition-colors',
                  PRIORITY_CONFIG[task.priority].badge,
                  PRIORITY_CONFIG[task.priority].badgeBg,
                  task.status === 'inbox' && 'cursor-pointer hover:opacity-80',
                  task.status !== 'inbox' && 'cursor-default opacity-70',
                )}
              >
                {PRIORITY_CONFIG[task.priority].label}
              </button>

              {/* Title */}
              <h2 className="flex-1 break-words text-sm font-semibold leading-snug text-foreground">
                {renderLinkifiedText(stripAllMentions(task.title), `modal-title-${task.id}`)}
              </h2>

              {/* Close */}
              <button
                onClick={onClose}
                className="flex-shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── Meta row: sender + chat + date ──────────────────────────── */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-b border-border/20 bg-muted/20">
              {/* Sender */}
              {(task.sender_first_name || task.sender_username || task.sender_id) && (() => {
                const displayName = task.sender_first_name || task.sender_username || `id:${task.sender_id}`
                const username = task.sender_username?.replace(/^@/, '')
                const tgUrl = username ? `tg://resolve?domain=${username}` : null
                return (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <User className="h-3 w-3 flex-shrink-0" />
                    {tgUrl ? (
                      <button
                        type="button"
                        title={task.sender_username ?? undefined}
                        onClick={() => window.electronAPI?.openExternal(tgUrl)}
                        className="font-medium text-foreground hover:text-indigo-400 transition-colors cursor-pointer"
                      >
                        {displayName}
                      </button>
                    ) : (
                      <span className="font-medium text-foreground">{displayName}</span>
                    )}
                  </span>
                )
              })()}

              {/* Chat */}
              {(task.chat_id || task.source_chat) && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageSquare className="h-3 w-3 flex-shrink-0" />
                  <span>
                    {chatNames?.get(task.chat_id || task.source_chat || '') ??
                      (task.chat_id || task.source_chat)}
                  </span>
                </span>
              )}

              {/* Thread */}
              {task.thread_id && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Hash className="h-3 w-3 flex-shrink-0" />
                  <span>
                    {threadNames?.get(`${task.chat_id}:${task.thread_id}`) ??
                      `тема #${task.thread_id}`}
                  </span>
                </span>
              )}

              {/* Date */}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {formatFullDate(task.created_at)}
              </span>
            </div>

            {task.source_changed && (
              <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-400">
                Сообщение в Telegram было отредактировано и больше не соответствует текущим правилам/mention.
              </div>
            )}

            {/* ── Peer reactions ───────────────────────────────────────────── */}
            {(() => {
              const reactions = parsePeerReactions(task.peer_reactions)
              if (!reactions.length) return null
              const byEmoji = reactions.reduce<Record<string, typeof reactions>>((acc, r) => {
                acc[r.emoji] = acc[r.emoji] ?? []
                acc[r.emoji].push(r)
                return acc
              }, {})
              return (
                <div className="flex flex-wrap items-center gap-2 border-b border-border/20 px-4 py-2">
                  <span className="text-[11px] text-muted-foreground">Реакции коллег:</span>
                  {Object.entries(byEmoji).map(([emoji, peers]) => (
                    <span
                      key={emoji}
                      className="flex items-center gap-1 rounded-md border border-border/30 bg-muted/20 px-2 py-0.5 text-[11px]"
                    >
                      <span>{emoji}</span>
                      <span className="text-foreground/80">
                        {peers.map((p) => p.first_name || p.username || '?').join(', ')}
                      </span>
                    </span>
                  ))}
                </div>
              )
            })()}

            {/* ── Body — full scrollable message text ─────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {task.body ? (
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                  {renderLinkifiedText(stripAllMentions(task.body), `modal-body-${task.id}`)}
                </p>
              ) : (
                <p className="break-words text-[13px] leading-relaxed text-foreground">
                  {renderLinkifiedText(stripAllMentions(task.title), `modal-title-fallback-${task.id}`)}
                </p>
              )}
            </div>

            {/* ── Actions footer ───────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border/30 px-4 py-3">

              {/* Done / Reopen */}
              {task.status === 'done' ? (
                <button
                  onClick={() => { onReopen(task.id); onClose() }}
                  disabled={loadingId === task.id}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Вернуть в inbox
                </button>
              ) : task.status === 'snoozed' ? (
                <button
                  onClick={() => { onReopen(task.id); onClose() }}
                  disabled={loadingId === task.id}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  В inbox
                </button>
              ) : (
                <button
                  onClick={() => { onDone(task.id); onClose() }}
                  disabled={loadingId === task.id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border border-indigo-500/30',
                    'bg-indigo-500/10 px-3 py-1.5 text-[12px] font-medium text-indigo-400',
                    'transition-colors hover:bg-indigo-500 hover:text-white hover:border-indigo-500',
                    'disabled:opacity-50',
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                  Done
                </button>
              )}

              {/* Snooze — inbox only */}
              {task.status === 'inbox' && (
                <div className="relative" ref={snoozeRef}>
                  <button
                    onClick={() => setSnoozeOpen((v) => !v)}
                    className={cn(
                      'flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors',
                      'hover:border-border hover:text-foreground',
                      snoozeOpen && 'border-indigo-500/50 text-indigo-400',
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Отложить
                    <ChevronDown className={cn('h-3 w-3 transition-transform', snoozeOpen && 'rotate-180')} />
                  </button>

                  {snoozeOpen && (
                    <div className="absolute bottom-full left-0 mb-1 min-w-[140px] rounded-lg border border-border/50 bg-card shadow-xl z-10">
                      {SNOOZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => {
                            setSnoozeOpen(false)
                            onSnooze(task.id, opt.minutes())
                            onClose()
                          }}
                          className="flex w-full items-center px-3 py-2 text-[12px] text-foreground transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Dismiss — inbox only */}
              {task.status === 'inbox' && (
                <button
                  onClick={() => { onDismiss(task.id); onClose() }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-[12px] text-red-400 transition-colors hover:bg-red-500/10"
                >
                  Убрать
                </button>
              )}

              {/* Open in Telegram — push right */}
              {task.source_message_id && (task.chat_id || task.source_chat) && (
                <a
                  href={buildTgLinks(task.chat_id || task.source_chat || '', task.source_message_id).web}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  onClick={(e) => {
                    const links = buildTgLinks(task.chat_id || task.source_chat || '', task.source_message_id)
                    if (window.electronAPI) {
                      e.preventDefault()
                      window.electronAPI.openExternal(links.deep)
                    }
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  В Telegram
                </a>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
