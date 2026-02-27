export type TaskStatus = 'inbox' | 'done' | 'snoozed'
export type TabId = 'inbox' | 'done' | 'snoozed'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: number
  title: string
  source_chat: string
  source_message_id: number
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

export type WsEventType = 'task_created' | 'task_committed' | 'task_updated' | 'task_woken' | 'ping'

export interface WsEvent {
  type: WsEventType
  data?: Task | Record<string, unknown>
}
