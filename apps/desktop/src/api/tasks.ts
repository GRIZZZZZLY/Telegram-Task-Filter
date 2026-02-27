import { apiFetch } from './client'
import type { Task, TaskListResponse } from '@/types/task'

export interface GetTasksParams {
  status?: string
  limit?: number
  offset?: number
}

export function getTasks(params: GetTasksParams = {}): Promise<TaskListResponse> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.limit != null) query.set('limit', String(params.limit))
  if (params.offset != null) query.set('offset', String(params.offset))
  const qs = query.toString()
  return apiFetch<TaskListResponse>(`/tasks${qs ? `?${qs}` : ''}`)
}

export function markDone(id: number): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/done`, { method: 'POST' })
}

export function snoozeTask(id: number, minutes: number): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  })
}

export function reopenTask(id: number): Promise<{ task: Task; warning?: string }> {
  return apiFetch(`/tasks/${id}/reopen`, { method: 'POST' })
}

export function changePriority(id: number, priority: string): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/priority`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priority }),
  })
}

export function clearDoneTasks(): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/tasks/done', { method: 'DELETE' })
}
