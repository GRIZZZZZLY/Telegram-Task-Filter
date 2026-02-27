import { useCallback, useEffect, useRef, useState } from 'react'
import { getTasks, markDone, reopenTask, snoozeTask, changePriority } from '@/api/tasks'
import { WS_URL } from '@/api/client'
import type { Task, TabId, TaskPriority, WsEvent } from '@/types/task'

// TabId re-export для удобства
export type { TabId }

interface UseTasksResult {
  tasks: Task[]
  loading: boolean
  error: string | null
  loadingId: number | null
  pendingUndo: { id: number; title: string } | null
  handleDone: (id: number) => Promise<void>
  handleSnooze: (id: number, minutes: number) => Promise<void>
  handleReopen: (id: number) => Promise<void>
  handleUndoDone: (id: number) => Promise<void>
  handlePriorityChange: (id: number, priority: TaskPriority) => Promise<void>
  clearUndo: () => void
  refetch: () => Promise<void>
}

export function useTasks(status: string): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [pendingUndo, setPendingUndo] = useState<{ id: number; title: string } | null>(null)

  const wsRef = useRef<WebSocket | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      setError(null)
      const res = await getTasks({ status, limit: 50 })
      setTasks(res.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки задач')
    } finally {
      setLoading(false)
    }
  }, [status])

  // Начальная загрузка и при смене таба
  useEffect(() => {
    setLoading(true)
    void fetchTasks()
  }, [fetchTasks])

  // WebSocket — всегда активен для всех вкладок
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onmessage = (e: MessageEvent<string>) => {
        try {
          const event = JSON.parse(e.data) as WsEvent
          const task = event.data as Task | undefined

          if (event.type === 'task_created' && task) {
            // Новая задача → добавить в inbox
            if (status === 'inbox') {
              setTasks((prev) => prev.some((t) => t.id === task.id) ? prev : [task, ...prev])
            }
            const title = task.title.length > 60 ? task.title.slice(0, 60) + '…' : task.title
            window.electronAPI?.notify('🔵 Новая задача', title)
          }

          if (event.type === 'task_woken' && task) {
            // Задача проснулась → убрать из snoozed, добавить в inbox
            if (status === 'snoozed') {
              setTasks((prev) => prev.filter((t) => t.id !== task.id))
            }
            if (status === 'inbox') {
              setTasks((prev) => prev.some((t) => t.id === task.id) ? prev : [task, ...prev])
            }
            window.electronAPI?.notify('⏰ Задача напоминает о себе', task.title.slice(0, 60))
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = () => ws.close()
      ws.onclose = () => { setTimeout(connect, 3000) }
    }

    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [status])

  const handleDone = useCallback(async (id: number) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    setLoadingId(id)
    try {
      await markDone(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
      setPendingUndo({ id, title: task.title })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoadingId(null)
    }
  }, [tasks])

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
    setPendingUndo(null)
    setLoadingId(id)
    try {
      await reopenTask(id)
      await fetchTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отмены')
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

  const clearUndo = useCallback(() => setPendingUndo(null), [])

  return {
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
    refetch: fetchTasks,
  }
}
