import { apiFetch } from './client'

export interface LogsResponse {
  lines: string[]
  file: string
  total_lines: number
}

export type LogLevel = 'ALL' | 'ERROR' | 'WARNING' | 'INFO'

export async function fetchLogs(lines = 200, level: LogLevel = 'ALL'): Promise<LogsResponse> {
  const params = new URLSearchParams({ lines: String(lines) })
  if (level !== 'ALL') params.set('level', level)
  return apiFetch<LogsResponse>(`/logs?${params}`)
}
