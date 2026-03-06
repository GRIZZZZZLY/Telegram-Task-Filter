import { useCallback, useEffect, useRef, useState } from 'react'
import { getTasks, markDone, reopenTask, snoozeTask, changePriority, reorderTasks, dismissTask, pinTask, startWorkTask } from '@/api/tasks'
import { getWsUrl } from '@/api/client'
import type { Task, TabId, TaskPriority, WsEvent } from '@/types/task'
import { playNewTaskSound } from '@/lib/sound'

// TabId re-export для удобства
export type { TabId }

function normalizeTask(raw: Task | (Record<string, unknown> & { id: number })): Task {
  const chatId = (raw as { chat_id?: string }).chat_id
    ?? (raw as { source_chat?: string }).source_chat
    ?? ''

  return {
    ...(raw as Task),
    chat_id: chatId,
    thread_id: (raw as { thread_id?: string | null }).thread_id ?? null,
    trigger_message_id: (raw as { trigger_message_id?: number | null }).trigger_message_id ?? null,
    in_progress: (raw as { in_progress?: boolean }).in_progress ?? false,
    work_started_at: (raw as { work_started_at?: string | null }).work_started_at ?? null,
    source_changed: (raw as { source_changed?: boolean }).source_changed ?? false,
    source_edited_at: (raw as { source_edited_at?: string | null }).source_edited_at ?? null,
  }
}

interface UseTasksResult {
  tasks: Task[]
  loading: boolean
  error: string | null
  loadingId: number | null
  pendingUndo: { id: number; title: string } | null
  failedCommitIds: Set<number>
  handleDone: (id: number, customReply?: string) => Promise<void>
  handleDismiss: (id: number) => Promise<void>
  handleSnooze: (id: number, minutes: number) => Promise<void>
  handleReopen: (id: number) => Promise<void>
  handleUndoDone: (id: number) => Promise<void>
  handlePriorityChange: (id: number, priority: TaskPriority) => Promise<void>
  handleReorder: (ids: number[]) => Promise<void>
  handlePin: (id: number) => Promise<void>
  handleStartWork: (id: number) => Promise<void>
  clearUndo: () => void
  refetch: () => Promise<void>
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
}

export function useTasks(status: string, refreshTrigger?: number): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [pendingUndo, setPendingUndo] = useState<{ id: number; title: string } | null>(null)
  const [failedCommitIds, setFailedCommitIds] = useState<Set<number>>(new Set())

  // Ref tracks current pending-done task id for clearUndo (avoids stale closures)
  const pendingUndoIdRef = useRef<number | null>(null)

  const wsRef = useRef<WebSocket | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      setError(null)
      const res = await getTasks({ status, limit: 50 })
      setTasks(res.items.map((t) => normalizeTask(t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки задач')
    } finally {
      setLoading(false)
    }
  }, [status])

  // Начальная загрузка, при смене таба, и при изменении refreshTrigger
  useEffect(() => {
    setLoading(true)
    void fetchTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTasks, refreshTrigger])

  // WebSocket — всегда активен для всех вкладок
  useEffect(() => {
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onmessage = (e: MessageEvent<string>) => {
        if (cancelled) return
        try {
          const event = JSON.parse(e.data) as WsEvent
          const task = event.data as Task | undefined

          if (event.type === 'task_created' && task) {
            const normalized = normalizeTask(task)
            // Уведомление и звук — всегда, независимо от вкладки
            const title = normalized.title.length > 60 ? normalized.title.slice(0, 60) + '…' : normalized.title
            window.electronAPI?.notify('🔵 Новая задача', title)
            playNewTaskSound()
            // Refetch вместо ручной вставки — сервер вернёт задачи в правильном порядке
            // (учитывает настройку sort_direction, закреплённые задачи и приоритет)
            if (status === 'inbox') {
              void fetchTasks()
            }
          }

          if (event.type === 'task_committed') {
            // Backend sends { task_id: N }, not a full Task object
            const taskId = (event.data as { task_id: number } | undefined)?.task_id
            if (taskId == null) return
            // Task was committed (reaction sent) — remove from inbox list
            if (status === 'inbox') {
              setTasks((prev) => prev.filter((t) => t.id !== taskId))
            }
            // Clear undo state if this was the pending task
            if (pendingUndoIdRef.current === taskId) {
              pendingUndoIdRef.current = null
              setPendingUndo(null)
            }
            // Clear any failure flag for this task (successful commit)
            setFailedCommitIds((prev) => {
              if (!prev.has(taskId)) return prev
              const next = new Set(prev)
              next.delete(taskId)
              return next
            })
          }

          if (event.type === 'task_commit_failed') {
            const taskId = (event.data as { task_id: number } | undefined)?.task_id
            if (taskId == null) return
            setFailedCommitIds((prev) => new Set(prev).add(taskId))
          }

          if (event.type === 'inbox_cleared' && status === 'inbox') {
            setTasks([])
          }

          if (event.type === 'done_cleared' && status === 'done') {
            setTasks([])
          }

          if (event.type === 'task_woken' && task) {
            const normalized = normalizeTask(task)
            // Задача проснулась → убрать из snoozed
            if (status === 'snoozed') {
              setTasks((prev) => prev.filter((t) => t.id !== normalized.id))
            }
            // В inbox — refetch чтобы задача встала на правильную позицию
            if (status === 'inbox') {
              void fetchTasks()
            }
            window.electronAPI?.notify('⏰ Задача напоминает о себе', normalized.title.slice(0, 60))
          }

          if (event.type === 'task_updated' && task) {
            const normalized = normalizeTask(task)
            setTasks((prev) => prev.map((t) => (t.id === normalized.id ? { ...t, ...normalized } : t)))
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = () => ws.close()
      ws.onclose = () => {
        if (cancelled) return
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [status])

  const handleDone = useCallback(async (id: number, customReply?: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    setLoadingId(id)
    try {
      await markDone(id, customReply)
      // Don't remove from list yet — card transforms into inline-undo state.
      // If there was a different pending task, remove it from the list now.
      if (pendingUndoIdRef.current !== null && pendingUndoIdRef.current !== id) {
        const prevId = pendingUndoIdRef.current
        setTasks((ts) => ts.filter((t) => t.id !== prevId))
      }
      pendingUndoIdRef.current = id
      setPendingUndo({ id, title: task.title })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoadingId(null)
    }
  }, [tasks])

  const handleDismiss = useCallback(async (id: number) => {
    // Optimistic: remove immediately
    setTasks((prev) => prev.filter((t) => t.id !== id))
    try {
      await dismissTask(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления')
      await fetchTasks()
    }
  }, [fetchTasks])

  const handleReorder = useCallback(async (ids: number[]) => {
    // Optimistic: порядок уже применён в TaskList через setTasks
    try {
      await reorderTasks(ids)
    } catch {
      // Rollback on error
      await fetchTasks()
    }
  }, [fetchTasks])

  const handleSnooze = useCallback(async (id: number, minutes: number) => {
    setLoadingId(id)
    // Optimistic: убрать из текущего списка сразу
    setTasks((prev) => prev.filter((t) => t.id !== id))
    try {
      await snoozeTask(id, minutes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка откладывания')
      await fetchTasks()
    } finally {
      setLoadingId(null)
    }
  }, [fetchTasks])

  const handleReopen = useCallback(async (id: number) => {
    setLoadingId(id)
    try {
      await reopenTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoadingId(null)
    }
  }, [])

  const handleUndoDone = useCallback(async (id: number) => {
    // Task is still in local list (we never removed it), just clear pending state
    pendingUndoIdRef.current = null
    setPendingUndo(null)
    setLoadingId(id)
    try {
      await reopenTask(id)
      // Task remains in list with original inbox status — no refetch needed
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отмены')
      await fetchTasks() // fallback on error
    } finally {
      setLoadingId(null)
    }
  }, [fetchTasks])

  /** Optimistic priority change — updates locally then syncs to backend */
  const handlePriorityChange = useCallback(async (id: number, priority: TaskPriority) => {
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, priority } : t))
    try {
      await changePriority(id, priority)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка смены приоритета')
      // Rollback on error
      await fetchTasks()
    }
  }, [fetchTasks])

  const handlePin = useCallback(async (id: number) => {
    setLoadingId(id)
    try {
      await pinTask(id)
      // Refetch to get server-sorted order (pinned tasks move to top)
      await fetchTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка закрепления')
    } finally {
      setLoadingId(null)
    }
  }, [fetchTasks])

  const handleStartWork = useCallback(async (id: number) => {
    setLoadingId(id)
    try {
      const updated = await startWorkTask(id)
      const normalized = normalizeTask(updated)
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...normalized } : t)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отметки "в работе"')
    } finally {
      setLoadingId(null)
    }
  }, [])

  const clearUndo = useCallback(() => {
    // Undo window expired — now actually remove the pending-done task from the list
    const id = pendingUndoIdRef.current
    if (id !== null) {
      setTasks((ts) => ts.filter((t) => t.id !== id))
      pendingUndoIdRef.current = null
    }
    setPendingUndo(null)
  }, [])

  return {
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
    refetch: fetchTasks,
    setTasks,
  }
}
