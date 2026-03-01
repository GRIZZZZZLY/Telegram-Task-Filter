import { apiFetch } from './client'

export interface StatsPeriod {
  from_dt: string
  to_dt: string
}

export interface StatsSummary {
  total: number
  done: number
  inbox: number
  snoozed: number
  avg_completion_minutes: number | null
}

export interface ChatStat {
  chat_id: string
  count: number
}

export interface ThreadStat {
  chat_id: string
  thread_id: string
  count: number
}

export interface SenderStat {
  sender_id: string
  sender_username: string | null
  count: number
}

export interface PriorityStat {
  normal: number
  high: number
  medium: number
  low: number
}

export interface DayStat {
  date: string   // YYYY-MM-DD
  created: number
  done: number
}

export interface StatsResponse {
  period: StatsPeriod
  summary: StatsSummary
  by_chat: ChatStat[]
  by_thread: ThreadStat[]
  by_sender: SenderStat[]
  by_priority: PriorityStat
  by_day: DayStat[]
}

export type StatsPeriodKey = 'today' | 'week' | 'all' | 'custom'

export interface GetStatsParams {
  period: StatsPeriodKey
  from_date?: string   // YYYY-MM-DD
  to_date?: string     // YYYY-MM-DD
}

export function getStats(params: GetStatsParams): Promise<StatsResponse> {
  const q = new URLSearchParams({ period: params.period })
  if (params.from_date) q.set('from_date', params.from_date)
  if (params.to_date)   q.set('to_date',   params.to_date)
  return apiFetch<StatsResponse>(`/stats?${q.toString()}`)
}
