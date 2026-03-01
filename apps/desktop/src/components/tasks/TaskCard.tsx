import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, RotateCcw, Clock, ChevronDown, ChevronUp, Check, GripVertical, Trash2, Maximize2, Pin, PinOff } from 'lucide-react'
import type { Task, TaskPriority } from '@/types/task'
import { cn } from '@/lib/utils'
import { createPortal } from 'react-dom'
import { nativeConfirm } from '@/lib/dialog'
import { stripLeadingMentions } from '@/lib/text'

// ── Priority config ────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, {
  label: string
  bar: string
  badge: string
  badgeBg: string
}> = {
  normal: {
    label: 'NORM',
    bar: 'bg-slate-500',
    badge: 'text-slate-400',
    badgeBg: 'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/20',
  },
  high: {
    label: 'HIGH',
    bar: 'bg-red-500',
    badge: 'text-red-400',
    badgeBg: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20',
  },
  medium: {
    label: 'MED',
    bar: 'bg-amber-500',
    badge: 'text-amber-400',
    badgeBg: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20',
  },
  low: {
    label: 'LOW',
    bar: 'bg-emerald-500',
    badge: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20',
  },
}

const PRIORITY_CYCLE: TaskPriority[] = ['normal', 'high', 'medium', 'low']

// ── Snooze options ──────────────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildTgLink(chatId: string, messageId: number): string {
  const num = parseInt(chatId, 10)
  if (!isNaN(num) && num < 0) {
    const cleanId = String(Math.abs(num)).replace(/^100/, '')
    return `https://t.me/c/${cleanId}/${messageId}`
  }
  return `https://t.me/${chatId}/${messageId}`
}

function formatChatLabel(chatId: string): string {
  const num = parseInt(chatId, 10)
  if (!isNaN(num) && num < 0) return `чат …${String(Math.abs(num)).slice(-4)}`
  return chatId
}

const MSK_TZ = 'Europe/Moscow'

/** Returns YYYY-MM-DD string in Moscow timezone — for reliable date comparison. */
function toMskDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: MSK_TZ }) // "en-CA" → ISO YYYY-MM-DD
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000)

  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: MSK_TZ })

  // Compare calendar dates in Moscow timezone (not in browser local time)
  const dDateStr   = toMskDateStr(d)
  const nowDateStr = toMskDateStr(now)
  const ydDateStr  = toMskDateStr(new Date(now.getTime() - 86_400_000))

  if (dDateStr === nowDateStr) {
    if (diffMin < 1) return 'только что'
    return timeStr
  }
  if (dDateStr === ydDateStr) return `вчера ${timeStr}`

  const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: MSK_TZ })
  return `${dateStr} ${timeStr}`
}

function formatSnoozedUntil(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.ceil((d.getTime() - now.getTime()) / 60_000)
  if (diffMin <= 0) return 'скоро'
  if (diffMin < 60) return `${diffMin} мин`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} ч`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: MSK_TZ })
}

// ── Props ────────────────────────────────────────────────────────────────────

const UNDO_TIMEOUT_MS = 5000

interface Props {
  task: Task
  onDone: (id: number, customReply?: string) => void
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onReopen: (id: number) => void
  onPriorityChange: (id: number, priority: TaskPriority) => void
  onPin?: (id: number) => void
  loadingId: number | null
  compact?: boolean
  chatNames?: Map<string, string>
  threadNames?: Map<string, string>
  isDragging?: boolean
  /** Card is in "done, undo available" state — shows inline undo UI */
  isPendingDone?: boolean
  /** Called when user clicks Отменить */
  onUndoDone?: () => void
  /** Called when undo window expires */
  onDoneExpire?: () => void
  /** Telegram reaction/reply failed to send for this task */
  isCommitFailed?: boolean
  /** Called when user clicks the "open detail" expand button */
  onOpenDetail?: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function TaskCard({
  task,
  onDone,
  onDismiss,
  onSnooze,
  onReopen,
  onPriorityChange,
  onPin,
  loadingId,
  compact = false,
  chatNames,
  threadNames,
  isDragging = false,
  isPendingDone = false,
  onUndoDone,
  onDoneExpire,
  isCommitFailed = false,
  onOpenDetail,
}: Props) {
  const cfg = PRIORITY_CONFIG[task.priority]
  const isLoading = loadingId === task.id
  const isDone    = task.status === 'done'
  const isSnoozed = task.status === 'snoozed'
  const isInbox   = task.status === 'inbox'
  const isPinned  = task.sort_order !== null && task.sort_order < 0

  // Snooze dropdown
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const snoozeRef = useRef<HTMLDivElement>(null)
  const snoozeBtnRef = useRef<HTMLButtonElement>(null)
  const [snoozePos, setSnoozePos] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false })

  // Body expand/collapse
  const [expanded, setExpanded] = useState(false)

  // Custom reply inline input
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const replyInputRef = useRef<HTMLInputElement>(null)

  // Inline-undo progress (0-100)
  const [undoProgress, setUndoProgress] = useState(100)

  useEffect(() => {
    if (!isPendingDone) {
      setUndoProgress(100)
      return
    }
    setUndoProgress(100)
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / UNDO_TIMEOUT_MS) * 100)
      setUndoProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onDoneExpire?.()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [isPendingDone, onDoneExpire])

  useEffect(() => {
    if (replyOpen) setTimeout(() => replyInputRef.current?.focus(), 50)
  }, [replyOpen])

  useEffect(() => {
    if (!snoozeOpen || !snoozeBtnRef.current) return
    const rect = snoozeBtnRef.current.getBoundingClientRect()
    const dropdownH = SNOOZE_OPTIONS.length * 40 + 8
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceAbove > dropdownH || spaceAbove > spaceBelow
    setSnoozePos({
      top: openUp ? rect.top : rect.bottom + 4,
      left: rect.left,
      openUp,
    })
  }, [snoozeOpen])

  useEffect(() => {
    if (!snoozeOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        snoozeRef.current && !snoozeRef.current.contains(target) &&
        snoozeBtnRef.current && !snoozeBtnRef.current.contains(target)
      ) setSnoozeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [snoozeOpen])

  const handlePriorityClick = () => {
    if (isDone || isSnoozed) return
    const idx = PRIORITY_CYCLE.indexOf(task.priority)
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]
    onPriorityChange(task.id, next)
  }

  const handleDoneDefault = () => {
    setReplyOpen(false)
    onDone(task.id)
  }

  const handleDoneWithReply = () => {
    const text = replyText.trim()
    setReplyOpen(false)
    setReplyText('')
    onDone(task.id, text || undefined)
  }

  const chatId = task.chat_id || task.source_chat || ''
  const chatLabel = chatNames?.get(chatId) ?? formatChatLabel(chatId)
  const threadLabel = task.thread_id ? (threadNames?.get(`${chatId}:${task.thread_id}`) ?? `тема #${task.thread_id}`) : null

  const handleDismissClick = async () => {
    const ok = await nativeConfirm('Убрать задачу из inbox без реакции и ответа в Telegram?')
    if (!ok) return
    onDismiss(task.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative flex items-stretch rounded-xl border border-border/40 bg-card/80 shadow-sm backdrop-blur-sm',
        'transition-colors hover:border-border/70 hover:bg-card',
        isDone && 'opacity-60',
      )}
    >

      {/* Priority bar — thin coloured stripe (kept for visual accent) */}
      <div className={cn('w-1 flex-shrink-0 rounded-l-xl', cfg.bar)} />

      {/* ── Inline undo state ─────────────────────────────────────────────── */}
      {isPendingDone ? (
        <div className="relative flex flex-1 items-center gap-2 overflow-hidden px-3 py-3">
          {/* Depleting progress bar at the bottom edge */}
          <div
            className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 transition-none"
            style={{ width: `${undoProgress}%` }}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            ✅{' '}
            <span className="font-medium text-foreground">
              {task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}
            </span>
            {' '}выполнено
          </span>
          <button
            onClick={onUndoDone}
            className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Отменить
          </button>
        </div>
      ) : (
        /* Card body */
        <div className={cn('flex flex-1 flex-col gap-1 px-3', compact ? 'py-2' : 'py-2.5')}>

        {/* Top row: priority badge (clickable) + drag handle + time */}
        {!compact && (
          <div className="flex items-center gap-2">
            {/* Priority badge — click to cycle */}
            <button
              onClick={handlePriorityClick}
              disabled={isDone || isSnoozed}
              title={isInbox ? 'Сменить приоритет' : undefined}
              className={cn(
                'rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider transition-colors',
                cfg.badge,
                cfg.badgeBg,
                isInbox && 'cursor-pointer',
                (isDone || isSnoozed) && 'cursor-default opacity-70',
              )}
            >
              {cfg.label}
            </button>

            {/* Pinned badge */}
            {isPinned && (
              <span className="flex items-center gap-0.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400">
                <Pin className="h-2.5 w-2.5" />
                закреплено
              </span>
            )}

            {/* Commit-failed warning badge */}
            {isCommitFailed && (
              <span
                title="Не удалось отправить реакцию в Telegram. Проверьте логи."
                className="flex items-center gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400"
              >
                ⚠ Реакция не отправлена
              </span>
            )}

            {/* Drag handle — inbox only */}
            {isDragging && !isPinned && (
              <span className="cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 active:cursor-grabbing">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}

            {/* Time — push to right */}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {isSnoozed && task.snoozed_until
                ? <span className="text-indigo-400">⏰ {formatSnoozedUntil(task.snoozed_until)}</span>
                : formatTime(task.created_at)
              }
            </span>
          </div>
        )}

        {/* Title — leading @mention stripped for display */}
        <p className={cn(
          'font-medium leading-snug text-foreground',
          compact ? 'text-[13px] line-clamp-1' : expanded ? 'text-sm' : 'text-sm line-clamp-2',
        )}>
          {stripLeadingMentions(task.title)}
        </p>

        {/* Body — shown when expanded */}
        {!compact && expanded && task.body && (
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
            {stripLeadingMentions(task.body)}
          </p>
        )}

        {/* Expand / collapse toggle — only when body exists */}
        {!compact && task.body && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-0.5 self-start text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            {expanded
              ? <><ChevronUp className="h-3 w-3" />Свернуть</>
              : <><ChevronDown className="h-3 w-3" />Развернуть</>
            }
          </button>
        )}

        {/* Sender + source chat */}
        {!compact && (
          <p className="text-[11px] text-muted-foreground">
            {isSnoozed && task.snoozed_until ? null : (
              <>
                {task.sender_username && (
                  <><span className="font-medium text-foreground/80">{task.sender_username}</span> · </>
                )}
                из <span className="font-medium">{chatLabel}</span>
                {threadLabel ? <> · <span className="text-muted-foreground/80">{threadLabel}</span></> : null}
              </>
            )}
          </p>
        )}

        {/* Custom reply input — shown when arrow clicked */}
        {replyOpen && (
          <div className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-2 py-1">
            <input
              ref={replyInputRef}
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDoneWithReply()
                if (e.key === 'Escape') { setReplyOpen(false); setReplyText('') }
              }}
              placeholder="Свой ответ (Enter — отправить)"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            <button
              onClick={handleDoneWithReply}
              className="flex-shrink-0 rounded-md bg-indigo-500 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-600"
            >
              <Check className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Actions row */}
        <div className={cn('flex items-center gap-1.5', compact ? 'mt-0.5' : 'mt-1')}>

          {/* Done / Reopen */}
          {isDone ? (
            <button
              onClick={() => onReopen(task.id)}
              disabled={isLoading}
              className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Вернуть
            </button>
          ) : isSnoozed ? (
            <button
              onClick={() => onReopen(task.id)}
              disabled={isLoading}
              className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              В inbox
            </button>
          ) : (
            /* Split Done button: [✓ Done] [▾] */
            <div className="flex items-stretch">
              {/* Main Done */}
              <button
                onClick={handleDoneDefault}
                disabled={isLoading}
                className={cn(
                  'flex items-center gap-1.5 rounded-l-lg border border-r-0 border-indigo-500/20',
                  'bg-indigo-500/10 px-3 py-1 text-[12px] font-medium text-indigo-400',
                  'transition-colors hover:bg-indigo-500 hover:text-white hover:border-indigo-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {isLoading
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <Check className="h-3.5 w-3.5" />}
                Done
              </button>
              {/* Arrow — open custom reply */}
              <button
                onClick={() => setReplyOpen((v) => !v)}
                disabled={isLoading}
                title="Свой ответ"
                className={cn(
                  'flex items-center justify-center rounded-r-lg border border-indigo-500/20',
                  'bg-indigo-500/10 px-1.5 py-1 text-indigo-400',
                  'transition-colors hover:bg-indigo-500 hover:text-white hover:border-indigo-500',
                  'disabled:opacity-50',
                  replyOpen && 'bg-indigo-500/20 border-indigo-500/40',
                )}
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', replyOpen && 'rotate-180')} />
              </button>
            </div>
          )}

          {/* Snooze dropdown — inbox only */}
          {isInbox && (
            <div className="relative">
              <button
                ref={snoozeBtnRef}
                onClick={() => setSnoozeOpen((v) => !v)}
                disabled={isLoading}
                title="Отложить"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors',
                  'hover:border-border hover:text-foreground disabled:opacity-50',
                  snoozeOpen && 'border-indigo-500/50 text-indigo-400',
                )}
              >
                <Clock className="h-3 w-3" />
              </button>

              {snoozeOpen && createPortal(
                <div
                  ref={snoozeRef}
                  className="min-w-[140px] rounded-lg border border-border/50 bg-card shadow-xl"
                  style={{
                    position: 'fixed',
                    zIndex: 9999,
                    top: snoozePos.openUp ? undefined : snoozePos.top,
                    bottom: snoozePos.openUp ? window.innerHeight - snoozePos.top : undefined,
                    left: snoozePos.left,
                  }}
                >
                  {SNOOZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setSnoozeOpen(false)
                        onSnooze(task.id, opt.minutes())
                      }}
                      className="flex w-full items-center px-3 py-2 text-sm text-foreground transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          )}

          {isInbox && (
            <button
              onClick={handleDismissClick}
              disabled={isLoading}
              title="Убрать из inbox"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}

          {/* Pin / unpin — inbox only */}
          {isInbox && onPin && (
            <button
              onClick={() => onPin(task.id)}
              disabled={isLoading}
              title={isPinned ? 'Открепить' : 'Закрепить вверху'}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:opacity-50',
                isPinned
                  ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
                  : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {isPinned
                ? <PinOff className="h-3 w-3" />
                : <Pin className="h-3 w-3" />}
            </button>
          )}

          {/* Open detail modal */}
          {onOpenDetail && (
            <button
              onClick={onOpenDetail}
              title="Открыть подробности"
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}

          {/* Link to original message */}
          <a
            href={buildTgLink(chatId, task.source_message_id)}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground',
              !onOpenDetail && 'ml-auto',
            )}
            title="Открыть в Telegram"
            onClick={(e) => {
              e.preventDefault()
              window.electronAPI?.openExternal(buildTgLink(chatId, task.source_message_id))
            }}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        </div>
      )}
    </motion.div>
  )
}
