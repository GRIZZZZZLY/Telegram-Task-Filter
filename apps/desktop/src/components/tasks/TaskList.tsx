import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2, Trash2, X } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { TaskDetailModal } from './TaskDetailModal'
import { TgSearchField, TgToast, TgButton } from '@/components/tg'
import { useTasks } from '@/hooks/useTasks'
import { useChatNames } from '@/hooks/useChatNames'
import { useThreadNames } from '@/hooks/useThreadNames'
import { useKeyboard } from '@/hooks/useKeyboard'
import { clearDoneTasks } from '@/api/tasks'
import type { TabId, Task, TaskPriority } from '@/types/task'
import { cn } from '@/lib/utils'
import { nativeConfirm } from '@/lib/dialog'

interface Props {
  tab: TabId
  /** @deprecated use displayMode instead */
  compact?: boolean
  displayMode?: 'compact' | 'standard' | 'expanded'
  onInboxCountChange?: (count: number) => void
  /** Called when Escape is pressed (e.g. to close settings panel) */
  onEscape?: () => void
  /** Increment to force-refetch tasks (e.g. after sort settings change) */
  refreshTrigger?: number
  /** Settings/Stats overlay is open — list is hidden, so shortcuts must be off */
  overlayOpen?: boolean
}

export function TaskList({
  tab,
  compact = false,
  displayMode,
  onInboxCountChange,
  onEscape,
  refreshTrigger,
  overlayOpen = false,
}: Props) {
  const effectiveMode = displayMode ?? (compact ? 'compact' : 'standard')
  const {
    tasks,
    loading,
    error,
    actionError,
    loadingId,
    pendingUndo,
    pendingDismiss,
    failedCommitIds,
    handleDone,
    handleDismiss,
    handleSnooze,
    handleReopen,
    handleUndoDone,
    handleUndoDismiss,
    clearActionError,
    handlePriorityChange,
    handleReorder,
    handlePin,
    handleStartWork,
    clearUndo,
    refetch,
    setTasks,
  } = useTasks(tab, refreshTrigger)

  const [clearing, setClearing] = useState(false)
  const [search, setSearch] = useState('')
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const chatNames = useChatNames()
  const threadNames = useThreadNames(tasks)

  const visibleTasks = search.trim()
    ? tasks.filter((t) => {
        const q = search.toLowerCase()
        return (
          t.title.toLowerCase().includes(q) ||
          (t.body ?? '').toLowerCase().includes(q)
        )
      })
    : tasks

  const { selectedTaskId, setSelectedTaskId } = useKeyboard({
    tasks: visibleTasks,
    onDone: (id) => void handleDone(id),
    onUndo: pendingUndo ? () => void handleUndoDone(pendingUndo.id) : null,
    searchInputRef,
    onEscape,
    enabled: tab === 'inbox' && !overlayOpen,
  })

  // Arrow keys move the selection; the row has to follow into view.
  useEffect(() => {
    if (selectedTaskId === null) return
    document
      .querySelector(`[data-task-id="${selectedTaskId}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedTaskId])

  // Action errors fade on their own; the list underneath never goes away
  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(clearActionError, 5000)
    return () => clearTimeout(t)
  }, [actionError, clearActionError])

  // ── Drag-and-drop state ──────────────────────────────────────────────────
  const dragIdRef = useRef<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  /** Закреплённая задача: sort_order < 0. Нельзя перетаскивать и нельзя бросать на неё. */
  const isPinnedTask = (task: Task) => task.sort_order !== null && task.sort_order < 0

  const handleClearDone = useCallback(async () => {
    const ok = await nativeConfirm('Удалить все выполненные задачи?')
    if (!ok) return
    setClearing(true)
    try {
      await clearDoneTasks()
      await refetch()
    } catch {
      // ignore
    } finally {
      setClearing(false)
    }
  }, [refetch])

  useEffect(() => {
    if (tab === 'inbox') onInboxCountChange?.(tasks.length)
  }, [tab, tasks.length, onInboxCountChange])

  const onDragStart = (id: number) => {
    const task = tasks.find((t) => t.id === id)
    if (task && isPinnedTask(task)) return
    dragIdRef.current = id
  }

  const onDragOver = (e: React.DragEvent, overId: number) => {
    e.preventDefault()
    const overTask = tasks.find((t) => t.id === overId)
    if (overTask && isPinnedTask(overTask)) return
    if (dragIdRef.current !== overId) setDragOverId(overId)
  }

  const onDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    const fromId = dragIdRef.current
    if (fromId === null || fromId === targetId) {
      setDragOverId(null)
      return
    }

    const fromTask = tasks.find((t) => t.id === fromId)
    const toTask = tasks.find((t) => t.id === targetId)

    if ((fromTask && isPinnedTask(fromTask)) || (toTask && isPinnedTask(toTask))) {
      dragIdRef.current = null
      setDragOverId(null)
      return
    }

    setTasks((prev: Task[]) => {
      const pinned = prev.filter((t) => isPinnedTask(t))
      const nonPinned = prev.filter((t) => !isPinnedTask(t))

      const fromIdx = nonPinned.findIndex((t) => t.id === fromId)
      const toIdx = nonPinned.findIndex((t) => t.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev

      const [moved] = nonPinned.splice(fromIdx, 1)
      nonPinned.splice(toIdx, 0, moved)

      const next = [...pinned, ...nonPinned]
      void handleReorder(next.map((t) => t.id))
      return next
    })

    dragIdRef.current = null
    setDragOverId(null)
  }

  const onDragEnd = () => {
    dragIdRef.current = null
    setDragOverId(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-tg-text-sub" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-tg-base text-tg-text-sub">{error}</p>
        <p className="text-tg-sm text-tg-text-sub">
          Убедитесь, что бэкенд запущен на порту 8787
        </p>
      </div>
    )
  }

  const emptyText = tab === 'inbox'
    ? 'Нет активных'
    : tab === 'done'
      ? 'Нет завершённых'
      : 'Нет отложенных'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Search */}
      {tasks.length > 0 && (
        <div className="mx-auto w-full max-w-tg-list flex-none px-2 py-2">
          <TgSearchField
            value={search}
            onChange={setSearch}
            placeholder="Поиск по задачам... (Ctrl+F)"
            inputRef={searchInputRef}
            onEscape={() => setSearch('')}
          />
        </div>
      )}

      {/* Clear all done */}
      {tab === 'done' && tasks.length > 0 && (
        <div className="mx-auto flex w-full max-w-tg-list flex-none justify-end px-2 pb-1">
          <TgButton
            variant="attention"
            onClick={handleClearDone}
            disabled={clearing}
            className="h-7 px-2 text-tg-sm"
          >
            {clearing
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2 className="h-3 w-3" />}
            Очистить все
          </TgButton>
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div
          role="alert"
          className="mx-auto mb-1 flex w-full max-w-tg-list flex-none items-start gap-2 rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger"
        >
          <span className="min-w-0 flex-1 break-words">Не получилось: {actionError}</span>
          <button
            type="button"
            onClick={clearActionError}
            aria-label="Скрыть сообщение"
            className="shrink-0 rounded p-0.5 transition-colors duration-tg-universal hover:bg-tg-danger/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-tg-base text-tg-text-sub">{emptyText}</p>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
            <p className="text-tg-sm text-tg-text-sub">Ничего не найдено</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleTasks.map((task) => (
              <div
                key={task.id}
                data-task-id={task.id}
                onDragOver={(e) => onDragOver(e, task.id)}
                onDrop={(e) => onDrop(e, task.id)}
                className={cn(
                  'mx-auto w-full max-w-tg-list transition-opacity duration-tg-universal',
                  dragIdRef.current === task.id && 'opacity-40',
                  dragOverId === task.id && !isPinnedTask(task) && 'bg-tg-bg-over',
                )}
              >
                <TaskCard
                  task={task}
                  compact={effectiveMode === 'compact'}
                  forceExpanded={effectiveMode === 'expanded'}
                  chatNames={chatNames}
                  threadNames={threadNames}
                  onDone={handleDone}
                  onDismiss={handleDismiss}
                  onSnooze={handleSnooze}
                  onReopen={handleReopen}
                  onPriorityChange={(id: number, p: TaskPriority) => handlePriorityChange(id, p)}
                  onPin={tab === 'inbox' ? handlePin : undefined}
                  onStartWork={tab === 'inbox' ? handleStartWork : undefined}
                  loadingId={loadingId}
                  isDragging={tab === 'inbox' && !isPinnedTask(task)}
                  onDragHandleStart={() => onDragStart(task.id)}
                  onDragHandleEnd={onDragEnd}
                  isPendingDone={pendingUndo?.id === task.id}
                  onUndoDone={() => handleUndoDone(task.id)}
                  onDoneExpire={clearUndo}
                  isCommitFailed={failedCommitIds.has(task.id)}
                  onOpenDetail={() => setDetailTask(task)}
                  selected={selectedTaskId === task.id}
                  onSelect={() => setSelectedTaskId(task.id)}
                />
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Dismiss undo moved from a banner into a toast */}
      <TgToast
        open={pendingDismiss !== null}
        text={pendingDismiss ? `Убрано: ${pendingDismiss.title}` : ''}
        actionLabel="Отменить"
        onAction={handleUndoDismiss}
        onDismiss={() => {/* the hook owns the timer; nothing to do here */}}
      />

      <TaskDetailModal
        task={detailTask}
        chatNames={chatNames}
        threadNames={threadNames}
        loadingId={loadingId}
        onClose={() => setDetailTask(null)}
        onDone={handleDone}
        onDismiss={handleDismiss}
        onSnooze={handleSnooze}
        onReopen={handleReopen}
        onPriorityChange={handlePriorityChange}
      />
    </div>
  )
}
