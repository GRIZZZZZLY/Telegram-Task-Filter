export type TaskStatus = 'inbox' | 'done' | 'snoozed'
export type TabId = 'inbox' | 'done' | 'snoozed'
export type TaskPriority = 'normal' | 'high' | 'medium' | 'low'

export interface Task {
  id: number
  title: string
  body?: string | null
  chat_id: string
  thread_id: string | null
  // Backward compatibility for old WS payloads
  source_chat?: string
  source_message_id: number
  sender_id?: string | null
  sender_username?: string | null
  priority: TaskPriority
  status: TaskStatus
  created_at: string
  committed_at: string | null
  snoozed_until: string | null
  sort_order: number | null
  custom_reply: string | null
}

export interface TaskListResponse {
  items: Task[]
  total: number
}

export type WsEventType =
  | 'task_created'
  | 'task_committed'
  | 'task_commit_failed'
  | 'task_updated'
  | 'task_woken'
  | 'inbox_cleared'
  | 'done_cleared'
  | 'ping'

export interface WsEvent {
  type: WsEventType
  data?: Task | Record<string, unknown>
}
