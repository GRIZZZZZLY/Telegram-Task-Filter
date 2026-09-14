import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Clock, Eye, MoreVertical, GripVertical, ChevronDown } from 'lucide-react'
import type { Task, TaskPriority } from '@/types/task'
import { parsePeerReactions } from '@/types/task'
import { cn } from '@/lib/utils'
import { stripAllMentions } from '@/lib/text'
import { TgRow, TgAvatar, TgIconButton, TgPopupMenu } from '@/components/tg'
import type { TgMenuItem } from '@/components/tg'
import { TG_MS } from '@/lib/tg-motion'
import { peerColorVar } from '@/lib/peer-color'
import {
  formatChatLabel,
  formatTime,
  formatSnoozedUntil,
  splitUrls,
  SNOOZE_OPTIONS,
} from '@/lib/task-format'
import { TaskRowMenu } from './TaskRowMenu'

const UNDO_TIMEOUT_MS = 5000

/** Only two priorities get a stripe; normal and low are quiet, as in the spec. */
const PRIORITY_STRIPE: Record<TaskPriority, string | null> = {
  high: 'bg-tg-danger',
  medium: 'bg-[rgb(var(--tg-peer-3))]',
  normal: null,
  low: null,
}

interface Props {
  task: Task
  onDone: (id: number, customReply?: string) => void
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onReopen: (id: number) => void
  onPriorityChange: (id: number, priority: TaskPriority) => void
  onPin?: (id: number) => void
  onStartWork?: (id: number) => void
  loadingId: number | null
  compact?: boolean
  /** When true, body is always visible without clicking "Развернуть" */
  forceExpanded?: boolean
  chatNames?: Map<string, string>
  threadNames?: Map<string, string>
  isDragging?: boolean
  /** Card is in "done, undo available" state — shows inline undo UI */
  isPendingDone?: boolean
  onUndoDone?: () => void
  onDoneExpire?: () => void
  isCommitFailed?: boolean
  onOpenDetail?: () => void
  onDragHandleStart?: () => void
  onDragHandleEnd?: () => void
  /** Selected by keyboard navigation */
  selected?: boolean
  onSelect?: () => void
}

/** Renders message text with clickable links. */
function LinkedText({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  return (
    <>
      {splitUrls(text).map((chunk, i) =>
        chunk.kind === 'text' ? (
          <span key={`${keyPrefix}-${i}`}>{chunk.value}</span>
        ) : (
          <span key={`${keyPrefix}-${i}`}>
            <a
              href={chunk.href}
              target="_blank"
              rel="noreferrer"
              className="break-all text-tg-accent-text underline decoration-dotted underline-offset-2"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (chunk.href) window.electronAPI?.openExternal(chunk.href)
              }}
            >
              {chunk.value}
            </a>
            {chunk.trailing}
          </span>
        ),
      )}
    </>
  )
}

export function TaskCard({
  task,
  onDone,
  onDismiss,
  onSnooze,
  onReopen,
  onPriorityChange,
  onPin,
  onStartWork,
  loadingId,
  compact = false,
  forceExpanded = false,
  chatNames,
  threadNames,
  isDragging = false,
  isPendingDone = false,
  onUndoDone,
  onDoneExpire,
  isCommitFailed = false,
  onOpenDetail,
  onDragHandleStart,
  onDragHandleEnd,
  selected = false,
  onSelect,
}: Props) {
  const isLoading = loadingId === task.id
  const isDone = task.status === 'done'
  const isSnoozed = task.status === 'snoozed'
  const isInbox = task.status === 'inbox'
  const isPinned = task.sort_order !== null && task.sort_order < 0
  const isInProgress = task.in_progress

  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [snoozeAnchor, setSnoozeAnchor] = useState<{ x: number; y: number } | null>(null)
  const [expandedLocal, setExpandedLocal] = useState(false)
  const expanded = forceExpanded || expandedLocal
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const replyInputRef = useRef<HTMLInputElement>(null)
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

  const chatId = task.chat_id || task.source_chat || ''
  const chatLabel = chatNames?.get(chatId) ?? formatChatLabel(chatId)
  const threadLabel = task.thread_id
    ? (threadNames?.get(`${chatId}:${task.thread_id}`) ?? `тема #${task.thread_id}`)
    : null
  const authorName = task.sender_first_name || task.sender_username || chatLabel
  // Same colour the avatar uses, so name and circle always match.
  const authorColor = peerColorVar(chatId)

  const snoozeItems: TgMenuItem[] = SNOOZE_OPTIONS.map((opt) => ({
    id: opt.label,
    label: opt.label,
    icon: <Clock className="h-4 w-4" />,
    onSelect: () => onSnooze(task.id, opt.minutes()),
  }))

  const handleDoneDefault = () => {
    setReplyOpen(false)
    onDone(task.id, undefined)
  }

  const handleDoneWithReply = () => {
    const text = replyText.trim()
    setReplyOpen(false)
    setReplyText('')
    onDone(task.id, text || undefined)
  }

  // ── Undo strip ────────────────────────────────────────────────────────────

  if (isPendingDone) {
    return (
      <motion.div
        layout
        className="relative flex items-center gap-2 overflow-hidden border-b border-tg-divider px-3 py-3"
      >
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-tg-accent"
          style={{ width: `${undoProgress}%` }}
        />
        <span className="min-w-0 flex-1 truncate text-tg-base text-tg-text-sub">
          ✅{' '}
          <span className="font-semibold text-tg-text">
            {task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}
          </span>
          {' '}выполнено
        </span>
        <button
          type="button"
          onClick={onUndoDone}
          className="flex-none rounded-tg-btn px-2.5 py-1 text-tg-sm font-semibold text-tg-accent-text transition-colors duration-tg-universal hover:bg-tg-bg-over"
        >
          Отменить
        </button>
      </motion.div>
    )
  }

  // ── Row ───────────────────────────────────────────────────────────────────

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: TG_MS.slideWrap / 1000, ease: 'easeOut' }}
    >
      <TgRow
        selected={selected}
        onActivate={onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuAnchor({ x: e.clientX, y: e.clientY })
        }}
        className={cn('group px-3 py-2', isDone && 'opacity-60')}
      >
        {/* Priority stripe */}
        {PRIORITY_STRIPE[task.priority] && (
          <span
            aria-hidden="true"
            className={cn('absolute inset-y-0 left-0 w-[3px]', PRIORITY_STRIPE[task.priority])}
          />
        )}

        <div className="flex gap-2.5">
          <TgAvatar name={authorName} colorKey={chatId} size={compact ? 28 : 34} />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* Author and time */}
            <div className="flex items-baseline gap-2">
              <span
                className="min-w-0 flex-1 truncate text-tg-base font-semibold"
                style={{ color: authorColor }}
              >
                {authorName}
              </span>
              <span className="flex-none text-tg-sm tabular-nums text-tg-row-date">
                {isSnoozed && task.snoozed_until
                  ? `⏰ ${formatSnoozedUntil(task.snoozed_until)}`
                  : formatTime(task.created_at)}
              </span>
            </div>

            {/* Title */}
            <p
              className={cn(
                'break-words text-tg-base leading-snug text-tg-row-name',
                compact ? 'line-clamp-1' : expanded ? '' : 'line-clamp-2',
              )}
            >
              <LinkedText text={stripAllMentions(task.title)} keyPrefix={`title-${task.id}`} />
            </p>

            {/* Body when expanded */}
            {!compact && expanded && task.body && (
              <p className="whitespace-pre-wrap break-words text-tg-sm leading-relaxed text-tg-row-text">
                <LinkedText text={stripAllMentions(task.body)} keyPrefix={`body-${task.id}`} />
              </p>
            )}

            {/* Expand toggle */}
            {!compact && !forceExpanded && task.body && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedLocal((v) => !v)
                }}
                className="flex items-center gap-0.5 self-start text-tg-sm text-tg-accent-text"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform duration-tg-menu', expandedLocal && 'rotate-180')} />
                {expandedLocal ? 'Свернуть' : 'Развернуть'}
              </button>
            )}

            {/* Source line */}
            {!compact && (
              <p className="truncate text-tg-sm text-tg-row-text">
                из {chatLabel}
                {threadLabel ? ` · ${threadLabel}` : ''}
              </p>
            )}

            {/* Badges */}
            {!compact && (
              <div className="flex flex-wrap items-center gap-1.5">
                {isPinned && (
                  <span className="rounded-tg-sm bg-tg-bg-over px-1.5 py-0.5 text-tg-sm text-tg-text-sub">
                    закреплено
                  </span>
                )}
                {task.source_changed && (
                  <span
                    title="Сообщение в Telegram отредактировано и больше не соответствует текущим правилам/mention"
                    className="rounded-tg-sm bg-[rgb(var(--tg-peer-3)/0.16)] px-1.5 py-0.5 text-tg-sm text-[rgb(var(--tg-peer-3))]"
                  >
                    ⚠ источник изменён
                  </span>
                )}
                {isCommitFailed && (
                  <span
                    title="Не удалось отправить реакцию в Telegram. Проверьте логи."
                    className="rounded-tg-sm bg-tg-danger/15 px-1.5 py-0.5 text-tg-sm text-tg-danger"
                  >
                    ⚠ Реакция не отправлена
                  </span>
                )}
                {task.media_type && (
                  <span className="rounded-tg-sm bg-tg-bg-over px-1.5 py-0.5 text-tg-sm text-tg-text-sub">
                    {task.media_type === 'photo' ? '📎 Фото'
                      : task.media_type === 'video' ? '🎥 Видео'
                      : task.media_type === 'voice' ? '🔊 Голосовое'
                      : task.media_type === 'audio' ? '🔊 Аудио'
                      : task.media_type === 'location' ? '📎 Геолокация'
                      : '📎 Вложение'}
                  </span>
                )}
                {(() => {
                  const reactions = parsePeerReactions(task.peer_reactions)
                  if (!reactions.length) return null
                  const byEmoji = reactions.reduce<Record<string, typeof reactions>>((acc, r) => {
                    acc[r.emoji] = acc[r.emoji] ?? []
                    acc[r.emoji].push(r)
                    return acc
                  }, {})
                  return Object.entries(byEmoji).map(([emoji, peers]) => (
                    <span
                      key={emoji}
                      title={peers.map((p) => p.first_name || p.username || p.user_id || '?').join(', ')}
                      className="rounded-tg-sm bg-tg-bg-over px-1.5 py-0.5 text-tg-sm text-tg-text-sub"
                    >
                      {emoji} {peers.map((p) => p.first_name || p.username || '?').join(', ')}
                    </span>
                  ))
                })()}
              </div>
            )}

            {/* Custom reply */}
            {replyOpen && (
              <div className="flex items-center gap-1.5 rounded-tg-btn bg-tg-bg-over px-2 py-1">
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDoneWithReply()
                    if (e.key === 'Escape') { setReplyOpen(false); setReplyText('') }
                  }}
                  placeholder="Свой ответ (Enter — отправить)"
                  className="min-w-0 flex-1 bg-transparent text-tg-sm text-tg-text outline-none placeholder:text-tg-placeholder"
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDoneWithReply() }}
                  className="flex-none rounded-tg-btn bg-tg-btn px-2 py-0.5 text-tg-on-accent"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Three actions */}
            <div className="mt-1 flex items-center gap-1">
              {isInbox ? (
                <>
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDoneDefault() }}
                      disabled={isLoading}
                      className="flex h-7 items-center gap-1.5 rounded-l-tg-btn bg-tg-btn px-2.5 text-tg-sm font-semibold text-tg-on-accent transition-colors duration-tg-universal hover:bg-tg-btn-over disabled:opacity-50"
                    >
                      {isLoading
                        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        : <Check className="h-3.5 w-3.5" />}
                      Выполнено
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setReplyOpen((v) => !v) }}
                      disabled={isLoading}
                      title="Свой ответ"
                      aria-label="Свой ответ"
                      className="flex h-7 items-center rounded-r-tg-btn border-l border-tg-btn-over bg-tg-btn px-1.5 text-tg-on-accent transition-colors duration-tg-universal hover:bg-tg-btn-over disabled:opacity-50"
                    >
                      <ChevronDown className={cn('h-3 w-3 transition-transform duration-tg-menu', replyOpen && 'rotate-180')} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSnoozeAnchor({ x: e.clientX, y: e.clientY })
                    }}
                    disabled={isLoading}
                    className="flex h-7 items-center gap-1 rounded-tg-btn px-2 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over disabled:opacity-50"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Отложить
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onStartWork?.(task.id) }}
                    disabled={isLoading || !onStartWork}
                    title={isInProgress ? 'Снять статус "В работе"' : 'Отметить: "В работу" (👀)'}
                    className={cn(
                      'flex h-7 items-center gap-1 rounded-tg-btn px-2 text-tg-sm transition-colors duration-tg-universal disabled:opacity-50',
                      isInProgress
                        ? 'bg-tg-accent/15 text-tg-accent-text'
                        : 'text-tg-text-sub hover:bg-tg-bg-over',
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {isInProgress ? 'В работе' : 'В работу'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReopen(task.id) }}
                  disabled={isLoading}
                  className="flex h-7 items-center gap-1 rounded-tg-btn px-2 text-tg-sm text-tg-accent-text transition-colors duration-tg-universal hover:bg-tg-bg-over disabled:opacity-50"
                >
                  {isDone ? 'Вернуть' : 'В inbox'}
                </button>
              )}

              <div className="ml-auto flex items-center gap-0.5">
                {isDragging && !isPinned && (
                  <span
                    draggable
                    onDragStart={onDragHandleStart}
                    onDragEnd={onDragHandleEnd}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab px-1 text-tg-text-sub opacity-0 transition-opacity duration-tg-universal group-hover:opacity-100 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                )}
                <TgIconButton
                  label="Ещё"
                  size={26}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuAnchor({ x: e.clientX, y: e.clientY })
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </TgIconButton>
              </div>
            </div>
          </div>
        </div>
      </TgRow>

      <TaskRowMenu
        task={task}
        open={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        onOpenDetail={onOpenDetail}
        onPriorityChange={onPriorityChange}
        onPin={onPin}
        onDismiss={onDismiss}
        onReopen={onReopen}
      />

      <TgPopupMenu
        open={snoozeAnchor !== null}
        anchor={snoozeAnchor}
        onClose={() => setSnoozeAnchor(null)}
        items={snoozeItems}
      />
    </motion.div>
  )
}
