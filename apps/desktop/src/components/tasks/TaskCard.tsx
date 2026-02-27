import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, RotateCcw, Clock } from 'lucide-react'
import type { Task, TaskPriority } from '@/types/task'
import { DoneButton } from './DoneButton'
import { cn } from '@/lib/utils'
import { createPortal } from 'react-dom'

// ── Priority config ────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, {
  label: string
  bar: string      // left border colour
  badge: string    // text badge colour
}> = {
  high: {
    label: 'HIGH',
    bar: 'bg-red-500',
    badge: 'text-red-400',
  },
  medium: {
    label: 'MED',
    bar: 'bg-amber-500',
    badge: 'text-amber-400',
  },
  low: {
    label: 'LOW',
    bar: 'bg-emerald-500',
    badge: 'text-emerald-400',
  },
}

const PRIORITY_CYCLE: TaskPriority[] = ['high', 'medium', 'low']

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

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000)

  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  // Same day — show time only
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    if (diffMin < 1) return 'только что'
    return timeStr
  }

  // Yesterday
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `вчера ${timeStr}`
  }

  // Older — date + time
  const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
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
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  task: Task
  onDone: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onReopen: (id: number) => void
  onPriorityChange: (id: number, priority: TaskPriority) => void
  loadingId: number | null
  compact?: boolean
  /** Map of chatId → display name from GET /telegram/chats */
  chatNames?: Map<string, string>
}

// ── Component ────────────────────────────────────────────────────────────────

export function TaskCard({
  task,
  onDone,
  onSnooze,
  onReopen,
  onPriorityChange,
  loadingId,
  compact = false,
  chatNames,
}: Props) {
  const cfg = PRIORITY_CONFIG[task.priority]
  const isLoading = loadingId === task.id
  const isDone    = task.status === 'done'
  const isSnoozed = task.status === 'snoozed'
  const isInbox   = task.status === 'inbox'

  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const snoozeRef = useRef<HTMLDivElement>(null)
  const snoozeBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; openUp: boolean }>({ top: 0, left: 0, openUp: false })

  // Recalculate dropdown position when opening
  useEffect(() => {
    if (!snoozeOpen || !snoozeBtnRef.current) return
    const rect = snoozeBtnRef.current.getBoundingClientRect()
    const dropdownH = SNOOZE_OPTIONS.length * 40 + 8 // approx height
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceAbove > dropdownH || spaceAbove > spaceBelow
    setDropdownPos({
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
      ) {
        setSnoozeOpen(false)
      }
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
      {/* Priority bar — coloured left stripe */}
      <button
        onClick={handlePriorityClick}
        disabled={isDone || isSnoozed}
        title={isInbox ? 'Сменить приоритет' : undefined}
        className={cn(
          'w-1 flex-shrink-0 rounded-l-xl transition-opacity',
          cfg.bar,
          isInbox && 'cursor-pointer hover:opacity-80',
          (isDone || isSnoozed) && 'cursor-default',
        )}
      />

      {/* Card body */}
      <div className={cn('flex flex-1 flex-col gap-1 px-3', compact ? 'py-2' : 'py-2.5')}>

        {/* Top row: priority label + time */}
        {!compact && (
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-[10px] font-bold tracking-wider', cfg.badge)}>
              {cfg.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {isSnoozed && task.snoozed_until
                ? <span className="text-indigo-400">⏰ {formatSnoozedUntil(task.snoozed_until)}</span>
                : formatTime(task.created_at)
              }
            </span>
          </div>
        )}

        {/* Title */}
        <p className={cn(
          'font-medium leading-snug text-foreground',
          compact ? 'text-[13px] line-clamp-1' : 'text-sm line-clamp-2',
        )}>
          {task.title}
        </p>

        {/* Source chat (hidden in compact) */}
        {!compact && (
          <p className="text-[11px] text-muted-foreground">
            {isSnoozed && task.snoozed_until ? null : (
              <>из <span className="font-medium">
                {chatNames?.get(task.source_chat) ?? formatChatLabel(task.source_chat)}
              </span></>
            )}
          </p>
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
            <DoneButton onClick={() => onDone(task.id)} loading={isLoading} />
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
                    top: dropdownPos.openUp ? undefined : dropdownPos.top,
                    bottom: dropdownPos.openUp ? window.innerHeight - dropdownPos.top : undefined,
                    left: dropdownPos.left,
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

          {/* Link to original message */}
          <a
            href={buildTgLink(task.source_chat, task.source_message_id)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            title="Открыть в Telegram"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </motion.div>
  )
}
