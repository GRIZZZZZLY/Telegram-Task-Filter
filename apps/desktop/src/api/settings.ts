import { apiFetch } from './client'
import type { AppSettings, AppSettingsUpdate, TgChat, TgThread } from '@/types/settings'

export function getSettings(): Promise<AppSettings> {
  return apiFetch<AppSettings>('/settings')
}

export function updateSettings(patch: AppSettingsUpdate): Promise<AppSettings> {
  return apiFetch<AppSettings>('/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export function getTgChats(): Promise<TgChat[]> {
  return apiFetch<TgChat[]>('/telegram/chats')
}

export function getTgThreads(chatId: string): Promise<TgThread[]> {
  return apiFetch<TgThread[]>(`/telegram/threads/${chatId}`)
}

export function restartListener(): Promise<{ ok: boolean; message: string }> {
  return apiFetch('/telegram/restart-listener', { method: 'POST' })
}

export interface ScanHistoryResult {
  ok: boolean
  scanned: number
  created: number
  skipped_done: number
  skipped_dup: number
}

export function scanHistory(hours: number): Promise<ScanHistoryResult> {
  return apiFetch<ScanHistoryResult>(`/telegram/scan-history?hours=${hours}`, { method: 'POST' })
}
