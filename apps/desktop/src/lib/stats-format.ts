/** Wording used by the statistics screen. */

/** Average completion time, in words. */
export function formatMinutes(min: number | null): string {
  if (min === null) return '—'
  if (min < 60) return `${Math.round(min)} мин`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

/** Short chat label for charts, where the full id does not fit. */
export function shortChatId(chatId: string): string {
  const n = parseInt(chatId, 10)
  if (!isNaN(n) && n < 0) return `…${String(Math.abs(n)).slice(-4)}`
  return chatId.slice(-6)
}
