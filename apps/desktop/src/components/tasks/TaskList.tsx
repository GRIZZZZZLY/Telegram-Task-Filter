import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2, Trash2 } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { UndoToast } from './UndoToast'
import { useTasks } from '@/hooks/useTasks'
import { useChatNames } from '@/hooks/useChatNames'
import { clearDoneTasks } from '@/api/tasks'
import type { TabId, TaskPriority } from '@/types/task'

interface Props {
  tab: TabId
  compact?: boolean
  /** Called whenever inbox task count changes — used by AppShell for TopBar badge */
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
    clearUndo,
    refetch,
  } = useTasks(tab)

  const [clearing, setClearing] = useState(false)
  const chatNames = useChatNames()

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

  // Keep parent informed of inbox count for TopBar badge
  useEffect(() => {
    if (tab === 'inbox') onInboxCountChange?.(tasks.length)
  }, [tab, tasks.length, onInboxCountChange])

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
      {/* Clear All button — only on Done tab */}
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
            <TaskCard
              key={task.id}
              task={task}
              compact={compact}
              chatNames={chatNames}
              onDone={handleDone}
              onSnooze={handleSnooze}
              onReopen={handleReopen}
              onPriorityChange={(id: number, p: TaskPriority) => handlePriorityChange(id, p)}
              loadingId={loadingId}
            />
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
