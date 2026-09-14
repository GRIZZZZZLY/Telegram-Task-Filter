/**
 * TaskDetailModal — полный вид задачи в модальном окне.
 *
 * Показывает автора, чат, тему, дату, полный текст, вложение и реакции.
 * Действия внизу повторяют строку списка и закрывают окно.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Check, RotateCcw, Clock } from 'lucide-react'
import type { Task, TaskPriority } from '@/types/task'
import { parsePeerReactions } from '@/types/task'
import { stripAllMentions } from '@/lib/text'
import { TgButton, TgAvatar, TgIconButton, TgPopupMenu } from '@/components/tg'
import type { TgMenuItem } from '@/components/tg'
import { TG_MS } from '@/lib/tg-motion'
import {
  buildTgLinks,
  formatChatLabel,
  formatFullDate,
  splitUrls,
  SNOOZE_OPTIONS,
  nextPriority,
} from '@/lib/task-format'

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  normal: 'Обычный',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
}

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
  const [snoozeAnchor, setSnoozeAnchor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!task) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [task, onClose])

  const snoozeItems: TgMenuItem[] = task
    ? SNOOZE_OPTIONS.map((opt) => ({
        id: opt.label,
        label: opt.label,
        icon: <Clock className="h-4 w-4" />,
        onSelect: () => { onSnooze(task.id, opt.minutes()); onClose() },
      }))
    : []

  return createPortal(
    <AnimatePresence>
      {task && (() => {
        const chatId = task.chat_id || task.source_chat || ''
        const links = buildTgLinks(chatId, task.source_message_id)
        const chatLabel = chatNames?.get(chatId) ?? formatChatLabel(chatId)
        const threadLabel = task.thread_id
          ? (threadNames?.get(`${chatId}:${task.thread_id}`) ?? `тема #${task.thread_id}`)
          : null
        const authorName = task.sender_first_name || task.sender_username || `id:${task.sender_id ?? '?'}`
        const username = task.sender_username?.replace(/^@/, '')
        const reactions = parsePeerReactions(task.peer_reactions)
        const byEmoji = reactions.reduce<Record<string, typeof reactions>>((acc, r) => {
          acc[r.emoji] = acc[r.emoji] ?? []
          acc[r.emoji].push(r)
          return acc
        }, {})

        return (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: TG_MS.fadeWrap / 1000, ease: 'linear' }}
              className="fixed inset-0 z-[90]"
              style={{ background: 'var(--tg-layer)' }}
              onClick={onClose}
            />

            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: TG_MS.menuShow / 1000, ease: 'easeOut' }}
              className="fixed inset-x-3 bottom-3 top-9 z-[95] flex flex-col overflow-hidden rounded-tg-box bg-tg-box-bg shadow-[0_1px_3px_var(--tg-shadow),0_12px_32px_var(--tg-shadow)]"
            >
              {/* Header */}
              <div className="flex flex-none items-center gap-2 border-b border-tg-divider px-3 py-2.5">
                <TgAvatar name={authorName} colorKey={chatId} size={30} />
                <div className="min-w-0 flex-1">
                  {username ? (
                    <button
                      type="button"
                      title={task.sender_username ?? undefined}
                      onClick={() => window.electronAPI?.openExternal(`tg://resolve?domain=${username}`)}
                      className="block max-w-full truncate text-tg-box font-semibold text-tg-text-bold"
                    >
                      {authorName}
                    </button>
                  ) : (
                    <span className="block truncate text-tg-box font-semibold text-tg-text-bold">
                      {authorName}
                    </span>
                  )}
                  <span className="block truncate text-tg-sm text-tg-text-sub">
                    {chatLabel}{threadLabel ? ` · ${threadLabel}` : ''} · {formatFullDate(task.created_at)}
                  </span>
                </div>
                <TgIconButton label="Закрыть" onClick={onClose}>
                  <X className="h-4 w-4" />
                </TgIconButton>
              </div>

              {/* Source changed warning */}
              {task.source_changed && (
                <div className="flex-none border-b border-tg-divider bg-[rgb(var(--tg-peer-3)/0.12)] px-3 py-2 text-tg-sm text-[rgb(var(--tg-peer-3))]">
                  Сообщение в Telegram было отредактировано и больше не соответствует текущим правилам/mention.
                </div>
              )}

              {/* Body */}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
                <p className="whitespace-pre-wrap break-words text-tg-base leading-relaxed text-tg-text">
                  <LinkedText
                    text={stripAllMentions(task.body || task.title)}
                    keyPrefix={`modal-body-${task.id}`}
                  />
                </p>

                {task.media_type && (
                  <div className="flex items-center gap-3 rounded-tg-btn bg-tg-bg-over px-3 py-2.5">
                    <span className="text-[20px]">
                      {task.media_type === 'video' ? '🎥'
                        : task.media_type === 'voice' || task.media_type === 'audio' ? '🔊'
                        : '📎'}
                    </span>
                    <span className="flex-1 text-tg-sm text-tg-text-sub">
                      {task.media_type === 'photo' ? 'Фото'
                        : task.media_type === 'video' ? 'Видео'
                        : task.media_type === 'voice' ? 'Голосовое сообщение'
                        : task.media_type === 'audio' ? 'Аудио'
                        : task.media_type === 'location' ? 'Геолокация'
                        : 'Вложение'}
                    </span>
                    <TgButton
                      variant="light"
                      className="h-7 px-2 text-tg-sm"
                      onClick={() => window.electronAPI?.openExternal(links.deep)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Открыть в Telegram
                    </TgButton>
                  </div>
                )}

                {reactions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-tg-sm text-tg-text-sub">Реакции коллег:</span>
                    {Object.entries(byEmoji).map(([emoji, peers]) => (
                      <span
                        key={emoji}
                        className="rounded-tg-sm bg-tg-bg-over px-2 py-0.5 text-tg-sm text-tg-text-sub"
                      >
                        {emoji} {peers.map((p) => p.first_name || p.username || '?').join(', ')}
                      </span>
                    ))}
                  </div>
                )}

                {task.status === 'inbox' && (
                  <button
                    type="button"
                    onClick={() => onPriorityChange(task.id, nextPriority(task.priority))}
                    className="self-start text-tg-sm text-tg-accent-text"
                  >
                    Приоритет: {PRIORITY_LABEL[task.priority]}
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-none flex-wrap items-center gap-2 border-t border-tg-divider px-3 py-2.5">
                {task.status === 'inbox' ? (
                  <>
                    <TgButton
                      onClick={() => { onDone(task.id); onClose() }}
                      disabled={loadingId === task.id}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Выполнено
                    </TgButton>
                    <TgButton
                      variant="light"
                      onClick={(e) => setSnoozeAnchor({ x: e.clientX, y: e.clientY })}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Отложить
                    </TgButton>
                    <TgButton
                      variant="attention"
                      onClick={() => { onDismiss(task.id); onClose() }}
                    >
                      Убрать
                    </TgButton>
                  </>
                ) : (
                  <TgButton
                    variant="light"
                    onClick={() => { onReopen(task.id); onClose() }}
                    disabled={loadingId === task.id}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {task.status === 'done' ? 'Вернуть в inbox' : 'В inbox'}
                  </TgButton>
                )}

                <TgButton
                  variant="light"
                  className="ml-auto"
                  onClick={() => window.electronAPI?.openExternal(links.deep)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  В Telegram
                </TgButton>
              </div>
            </motion.div>

            <TgPopupMenu
              open={snoozeAnchor !== null}
              anchor={snoozeAnchor}
              onClose={() => setSnoozeAnchor(null)}
              items={snoozeItems}
            />
          </>
        )
      })()}
    </AnimatePresence>,
    document.body,
  )
}
