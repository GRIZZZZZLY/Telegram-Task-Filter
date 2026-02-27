import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2, Trash2 } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { UndoToast } from './UndoToast'
import { useTasks } from '@/hooks/useTasks'
import { useChatNames } from '@/hooks/useChatNames'
import { clearDoneTasks } from '@/api/tasks'
import type { TabId, Task, TaskPriority } from '@/types/task'
import { cn } from '@/lib/utils'

interface Props {
  tab: TabId
  compact?: boolean
  onInboxCountChange?: (count: number) => void
}

export function TaskList({ tab, compact = false, onInboxCountChange }: Props) {
  const {
    tasks,
    loading,
    error,
    loadingId,
    pendingUndo,
    handleDone,
    handleSnooze,
    handleReopen,
    handleUndoDone,
    handlePriorityChange,
    handleReorder,
    clearUndo,
    refetch,
    setTasks,
  } = useTasks(tab)

  const [clearing, setClearing] = useState(false)
  const chatNames = useChatNames()

  // ── Drag-and-drop state ──────────────────────────────────────────────────
  const dragIdRef = useRef<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  const handleClearDone = useCallback(async () => {
    if (!confirm('Удалить все выполненные задачи?')) return
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
    dragIdRef.current = id
  }

  const onDragOver = (e: React.DragEvent, overId: number) => {
    e.preventDefault()
    if (dragIdRef.current !== overId) setDragOverId(overId)
  }

  const onDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    const fromId = dragIdRef.current
    if (fromId === null || fromId === targetId) {
      setDragOverId(null)
      return
    }

    setTasks((prev: Task[]) => {
      const next = [...prev]
      const fromIdx = next.findIndex((t) => t.id === fromId)
      const toIdx = next.findIndex((t) => t.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      // Persist new order
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

      <div className="flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <div
              key={task.id}
              draggable={tab === 'inbox'}
              onDragStart={() => onDragStart(task.id)}
              onDragOver={(e) => onDragOver(e, task.id)}
              onDrop={(e) => onDrop(e, task.id)}
              onDragEnd={onDragEnd}
              className={cn(
                'transition-opacity',
                dragIdRef.current === task.id && 'opacity-40',
                dragOverId === task.id && 'ring-2 ring-indigo-500/60 rounded-xl',
              )}
            >
              <TaskCard
                task={task}
                compact={compact}
                chatNames={chatNames}
                onDone={handleDone}
                onSnooze={handleSnooze}
                onReopen={handleReopen}
                onPriorityChange={(id: number, p: TaskPriority) => handlePriorityChange(id, p)}
                loadingId={loadingId}
                isDragging={tab === 'inbox'}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      <UndoToast
        taskId={pendingUndo?.id ?? null}
        taskTitle={pendingUndo?.title ?? ''}
        onUndo={handleUndoDone}
        onExpire={clearUndo}
      />
    </>
  )
}
