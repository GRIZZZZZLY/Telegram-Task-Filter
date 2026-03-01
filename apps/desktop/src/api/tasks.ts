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

export function markDone(id: number, customReply?: string): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/done`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_reply: customReply ?? null }),
  })
}

export function reorderTasks(ids: number[]): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/tasks/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export function snoozeTask(id: number, minutes: number): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  })
}

export interface ReopenResult {
  task: Task
  reaction_removed: boolean
  reply_deleted: boolean
  warnings: string[]
}

export function reopenTask(id: number): Promise<ReopenResult> {
  return apiFetch<ReopenResult>(`/tasks/${id}/reopen`, { method: 'POST' })
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

export function clearInboxTasks(): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/tasks/inbox', { method: 'DELETE' })
}

export function dismissTask(id: number): Promise<{ ok: boolean; deleted: number }> {
  return apiFetch<{ ok: boolean; deleted: number }>(`/tasks/${id}/dismiss`, { method: 'POST' })
}

export function pinTask(id: number): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/pin`, { method: 'POST' })
}
