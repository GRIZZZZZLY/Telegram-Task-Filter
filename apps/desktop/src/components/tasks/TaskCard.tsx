import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Check,
  Clock,
  Eye,
  MoreVertical,
  GripVertical,
  Pin,
  AlertTriangle,
  Paperclip,
  Image as ImageIcon,
  Video,
  Mic,
  MapPin,
  RotateCcw,
} from 'lucide-react'
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

const MEDIA_ICON: Record<string, typeof Paperclip> = {
  photo: ImageIcon,
  video: Video,
  voice: Mic,
  audio: Mic,
  location: MapPin,
}

const MEDIA_LABEL: Record<string, string> = {
  photo: 'Фото',
  video: 'Видео',
  voice: 'Голосовое',
  audio: 'Аудио',
  location: 'Геолокация',
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
  /** When true, body is always visible without opening the task */
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

  const reactions = parsePeerReactions(task.peer_reactions)
  const reactionGroups = Object.entries(
    reactions.reduce<Record<string, typeof reactions>>((acc, r) => {
      acc[r.emoji] = acc[r.emoji] ?? []
      acc[r.emoji].push(r)
      return acc
    }, {}),
  )

  const timeLabel = isSnoozed && task.snoozed_until
    ? formatSnoozedUntil(task.snoozed_until)
    : formatTime(task.created_at)

  // ── Undo strip ────────────────────────────────────────────────────────────

  if (isPendingDone) {
    return (
      <motion.div
        layout
        className="relative flex items-center gap-2 overflow-hidden border-b border-tg-divider px-3 py-2"
      >
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-tg-accent"
          style={{ width: `${undoProgress}%` }}
        />
        <Check className="h-4 w-4 flex-none text-tg-good" />
        <span className="min-w-0 flex-1 truncate text-tg-base text-tg-text-sub">
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

  /** Actions stay out of the way until the row is hovered, focused or selected. */
  const actionsVisible = cn(
    'flex flex-none items-center gap-0.5 self-center transition-opacity duration-tg-universal',
    selected || replyOpen
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
  )

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
        onActivate={onOpenDetail ?? onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuAnchor({ x: e.clientX, y: e.clientY })
        }}
        className={cn('group px-3 py-2', isDone && 'opacity-60')}
      >
        {/* Priority stripe — only where priority still changes anything */}
        {isInbox && PRIORITY_STRIPE[task.priority] && (
          <span
            aria-hidden="true"
            className={cn('absolute inset-y-0 left-0 w-[3px]', PRIORITY_STRIPE[task.priority])}
          />
        )}

        <div className="flex items-center gap-2.5">
          <TgAvatar name={authorName} colorKey={chatId} size={compact ? 26 : 34} />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* Line 1 — the task itself, the only strong element */}
            <div className="flex items-baseline gap-2">
              <p
                className={cn(
                  'min-w-0 flex-1 break-words text-tg-base font-semibold leading-snug text-tg-row-name',
                  compact ? 'line-clamp-1' : 'line-clamp-2',
                )}
              >
                <LinkedText text={stripAllMentions(task.title)} keyPrefix={`title-${task.id}`} />
              </p>
              <span className="flex-none text-tg-sm tabular-nums text-tg-row-date">
                {isSnoozed && <Clock className="mr-0.5 inline h-3 w-3 align-[-1px]" />}
                {timeLabel}
              </span>
            </div>

            {/* Line 2 — who and where, plus state markers */}
            {!compact && (
              <div className="flex min-w-0 items-center gap-1.5 text-tg-sm text-tg-row-text">
                <span className="min-w-0 truncate">
                  <span className="font-medium" style={{ color: authorColor }}>{authorName}</span>
                  {' · '}
                  {chatLabel}
                  {threadLabel ? ` · ${threadLabel}` : ''}
                </span>

                {isPinned && (
                  <Pin aria-label="Закреплено" className="h-3 w-3 flex-none text-tg-text-sub" />
                )}
                {task.source_changed && (
                  <span
                    role="img"
                    aria-label="Источник изменён"
                    title="Сообщение в Telegram отредактировано и больше не соответствует текущим правилам/mention"
                    className="flex-none text-[rgb(var(--tg-peer-3))]"
                  >
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                )}
                {isCommitFailed && (
                  <span
                    role="img"
                    aria-label="Реакция не отправлена"
                    title="Не удалось отправить реакцию в Telegram. Проверьте логи."
                    className="flex-none text-tg-danger"
                  >
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                )}
                {task.media_type && (() => {
                  const Icon = MEDIA_ICON[task.media_type] ?? Paperclip
                  const label = MEDIA_LABEL[task.media_type] ?? 'Вложение'
                  return (
                    <span role="img" aria-label={label} title={label} className="flex-none text-tg-text-sub">
                      <Icon className="h-3 w-3" />
                    </span>
                  )
                })()}
                {reactionGroups.length > 0 && (
                  <span
                    title={reactions
                      .map((p) => `${p.emoji} ${p.first_name || p.username || p.user_id || '?'}`)
                      .join(', ')}
                    className="flex-none tabular-nums"
                  >
                    {reactionGroups.map(([emoji, peers]) => (
                      <span key={emoji}>{emoji}{peers.length > 1 ? peers.length : ''}</span>
                    ))}
                  </span>
                )}
              </div>
            )}

            {/* Body — only in the expanded mode */}
            {!compact && forceExpanded && task.body && (
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-tg-sm leading-relaxed text-tg-row-text">
                <LinkedText text={stripAllMentions(task.body)} keyPrefix={`body-${task.id}`} />
              </p>
            )}

            {/* Custom reply */}
            {replyOpen && (
              <div className="mt-1 flex items-center gap-1.5 rounded-tg-btn bg-tg-bg-over px-2 py-1">
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
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
          </div>

          {/* Actions — icons only, visible on hover, focus or selection */}
          <div className={actionsVisible}>
            {isDragging && !isPinned && (
              <span
                draggable
                onDragStart={onDragHandleStart}
                onDragEnd={onDragHandleEnd}
                onClick={(e) => e.stopPropagation()}
                title="Перетащить"
                className="cursor-grab px-0.5 text-tg-text-sub active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}

            {isInbox ? (
              <>
                <TgIconButton
                  label="Выполнено"
                  size={28}
                  disabled={isLoading}
                  onClick={(e) => { e.stopPropagation(); handleDoneDefault() }}
                  className="bg-tg-btn text-tg-on-accent hover:bg-tg-btn-over hover:text-tg-on-accent"
                >
                  {isLoading
                    ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    : <Check className="h-4 w-4" />}
                </TgIconButton>

                <TgIconButton
                  label="Отложить"
                  size={28}
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSnoozeAnchor({ x: e.clientX, y: e.clientY })
                  }}
                >
                  <Clock className="h-4 w-4" />
                </TgIconButton>

                <TgIconButton
                  label={isInProgress ? 'Снять «В работе»' : 'В работу'}
                  size={28}
                  disabled={isLoading || !onStartWork}
                  onClick={(e) => { e.stopPropagation(); onStartWork?.(task.id) }}
                  className={cn(isInProgress && 'bg-tg-accent/15 text-tg-accent-text')}
                >
                  <Eye className="h-4 w-4" />
                </TgIconButton>
              </>
            ) : (
              <TgIconButton
                label={isDone ? 'Вернуть в inbox' : 'В inbox'}
                size={28}
                disabled={isLoading}
                onClick={(e) => { e.stopPropagation(); onReopen(task.id) }}
              >
                <RotateCcw className="h-4 w-4" />
              </TgIconButton>
            )}

            <TgIconButton
              label="Ещё"
              size={28}
              onClick={(e) => {
                e.stopPropagation()
                setMenuAnchor({ x: e.clientX, y: e.clientY })
              }}
            >
              <MoreVertical className="h-4 w-4" />
            </TgIconButton>
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
        onCustomReply={isInbox ? () => setReplyOpen(true) : undefined}
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
