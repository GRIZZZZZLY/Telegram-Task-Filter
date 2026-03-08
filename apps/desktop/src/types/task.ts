export interface PeerReaction {
  user_id: string | null
  username: string | null   // e.g. "@m_yanitsky"
  first_name: string | null // e.g. "Миша"
  emoji: string             // e.g. "👀" or "👍"
  ts: string                // ISO timestamp
}

export function parsePeerReactions(raw: string | null | undefined): PeerReaction[] {
  if (!raw) return []
  try { return JSON.parse(raw) as PeerReaction[] } catch { return [] }
}

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
  trigger_message_id?: number | null
  sender_id?: string | null
  sender_username?: string | null
  sender_first_name?: string | null
  peer_reactions?: string | null  // JSON: PeerReaction[]
  priority: TaskPriority
  status: TaskStatus
  created_at: string
  committed_at: string | null
  snoozed_until: string | null
  sort_order: number | null
  custom_reply: string | null
  in_progress: boolean
  work_started_at: string | null
  source_changed: boolean
  source_edited_at: string | null
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
  | 'task_deleted'
  | 'ping'

export interface WsEvent {
  type: WsEventType
  data?: Task | Record<string, unknown>
}
