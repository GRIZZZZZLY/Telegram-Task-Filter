import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2, Trash2, Search, X } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { TaskDetailModal } from './TaskDetailModal'
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
}

export function TaskList({ tab, compact = false, displayMode, onInboxCountChange, onEscape, refreshTrigger }: Props) {
  // Resolve effective display mode: prefer displayMode prop, fall back to compact legacy
  const effectiveMode = displayMode ?? (compact ? 'compact' : 'standard')
  const {
    tasks,
    loading,
    error,
    loadingId,
    pendingUndo,
    failedCommitIds,
    handleDone,
    handleDismiss,
    handleSnooze,
    handleReopen,
    handleUndoDone,
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

  // Local search filter — case-insensitive match on title + body
  const visibleTasks = search.trim()
    ? tasks.filter((t) => {
        const q = search.toLowerCase()
        return (
          t.title.toLowerCase().includes(q) ||
          (t.body ?? '').toLowerCase().includes(q)
        )
      })
    : tasks

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const { selectedTaskId, setSelectedTaskId } = useKeyboard({
    tasks: visibleTasks,
    onDone: (id) => void handleDone(id),
    onUndo: pendingUndo ? () => void handleUndoDone(pendingUndo.id) : null,
    searchInputRef,
    onEscape,
    enabled: tab === 'inbox',
  })

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

  // ── DnD handlers (inbox only) ────────────────────────────────────────────

  const onDragStart = (id: number) => {
    const task = tasks.find((t) => t.id === id)
    if (task && isPinnedTask(task)) return  // Закреплённые не перетаскиваются
    dragIdRef.current = id
  }

  const onDragOver = (e: React.DragEvent, overId: number) => {
    e.preventDefault()
    const overTask = tasks.find((t) => t.id === overId)
    if (overTask && isPinnedTask(overTask)) return  // Нельзя бросать на закреплённую
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
    const toTask   = tasks.find((t) => t.id === targetId)

    // Защита: закреплённые задачи не участвуют в DnD
    if ((fromTask && isPinnedTask(fromTask)) || (toTask && isPinnedTask(toTask))) {
      dragIdRef.current = null
      setDragOverId(null)
      return
    }

    setTasks((prev: Task[]) => {
      // Закреплённые всегда остаются сверху, переупорядочиваем только незакреплённые
      const pinned    = prev.filter((t) => isPinnedTask(t))
      const nonPinned = prev.filter((t) => !isPinnedTask(t))

      const fromIdx = nonPinned.findIndex((t) => t.id === fromId)
      const toIdx   = nonPinned.findIndex((t) => t.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev

      const [moved] = nonPinned.splice(fromIdx, 1)
      nonPinned.splice(toIdx, 0, moved)

      const next = [...pinned, ...nonPinned]
      // Передаём все ID — reorder() на бэкенде пропустит закреплённые
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground/60">
          Убедитесь, что бэкенд запущен на порту 8787
        </p>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <p className="text-2xl">
          {tab === 'inbox' ? '🎉' : tab === 'done' ? '✅' : '💤'}
        </p>
        <p className="text-sm text-muted-foreground">
          {tab === 'inbox'
            ? 'Нет активных задач'
            : tab === 'done'
              ? 'Нет завершённых задач'
              : 'Нет отложенных задач'}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Search bar */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setSearch(''); e.currentTarget.blur() }
          }}
          placeholder="Поиск по задачам... (Ctrl+F)"
          className={cn(
            'w-full rounded-lg border border-border/40 bg-muted/30 py-1.5 pl-7 pr-7 text-[12px]',
            'text-foreground placeholder:text-muted-foreground/40',
            'outline-none transition-colors focus:border-indigo-500/50 focus:bg-muted/50',
          )}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {tab === 'done' && tasks.length > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            onClick={handleClearDone}
            disabled={clearing}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1 text-[12px] text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            {clearing
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2 className="h-3 w-3" />}
            Очистить все
          </button>
        </div>
      )}

      {/* No search results */}
      {visibleTasks.length === 0 && search && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center">
          <p className="text-muted-foreground/60 text-[12px]">Ничего не найдено</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              onDragOver={(e) => onDragOver(e, task.id)}
              onDrop={(e) => onDrop(e, task.id)}
              onClick={() => setSelectedTaskId(task.id)}
              className={cn(
                'transition-opacity rounded-xl',
                dragIdRef.current === task.id && 'opacity-40',
                dragOverId === task.id && !isPinnedTask(task) && 'ring-2 ring-indigo-500/60',
                selectedTaskId === task.id && 'ring-2 ring-indigo-400/70',
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
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Task detail modal */}
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
    </>
  )
}
