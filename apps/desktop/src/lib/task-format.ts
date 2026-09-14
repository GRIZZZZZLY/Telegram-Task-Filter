/**
 * Formatting shared by the task row and the task window.
 *
 * All of it is pure: same input, same output, no DOM. That is what makes it
 * testable, and it used to be duplicated in two components with small
 * differences between the copies.
 */
import type { TaskPriority } from '@/types/task'
import { parseBackendDate, withDeviceTimeZone } from '@/lib/date'

/** Links to one Telegram message: the desktop app link and the web fallback. */
export function buildTgLinks(chatId: string, messageId: number): { deep: string; web: string } {
  const num = parseInt(chatId, 10)
  if (!isNaN(num) && num < 0) {
    // Supergroups and channels carry a -100 prefix that the links do not use.
    const cleanId = String(Math.abs(num)).replace(/^100/, '')
    return {
      deep: `tg://privatepost?channel=${cleanId}&post=${messageId}`,
      web: `https://t.me/c/${cleanId}/${messageId}`,
    }
  }
  if (!isNaN(num)) {
    return {
      deep: `https://t.me/${chatId}/${messageId}`,
      web: `https://t.me/${chatId}/${messageId}`,
    }
  }
  const normalized = chatId.replace(/^@/, '')
  return {
    deep: `tg://resolve?domain=${normalized}&post=${messageId}`,
    web: `https://t.me/${normalized}/${messageId}`,
  }
}

/** A chat id a person can recognise, when the real name is not known yet. */
export function formatChatLabel(chatId: string): string {
  const num = parseInt(chatId, 10)
  if (!isNaN(num) && num < 0) return `чат …${String(Math.abs(num)).slice(-4)}`
  return chatId
}

/** YYYY-MM-DD in the device timezone, for comparing calendar days. */
function toLocalDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', withDeviceTimeZone({}))
}

/** Telegram-style message time: today as a clock, yesterday and older as a date. */
export function formatTime(iso: string): string {
  const d = parseBackendDate(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000)
  const timeStr = d.toLocaleTimeString('ru-RU', withDeviceTimeZone({ hour: '2-digit', minute: '2-digit' }))

  const dDateStr = toLocalDateStr(d)
  const nowDateStr = toLocalDateStr(now)
  const ydDateStr = toLocalDateStr(new Date(now.getTime() - 86_400_000))

  if (dDateStr === nowDateStr) {
    if (diffMin < 1) return 'только что'
    return timeStr
  }
  if (dDateStr === ydDateStr) return `вчера ${timeStr}`

  const dateStr = d.toLocaleDateString('ru-RU', withDeviceTimeZone({ day: 'numeric', month: 'short' }))
  return `${dateStr} ${timeStr}`
}

/** How long until a snoozed task comes back. */
export function formatSnoozedUntil(iso: string): string {
  const d = parseBackendDate(iso)
  const now = new Date()
  const diffMin = Math.ceil((d.getTime() - now.getTime()) / 60_000)
  if (diffMin <= 0) return 'скоро'
  if (diffMin < 60) return `${diffMin} мин`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} ч`
  return d.toLocaleDateString('ru-RU', withDeviceTimeZone({ day: 'numeric', month: 'short' }))
}

/** Full date in words, for the task window. */
export function formatFullDate(iso: string): string {
  return parseBackendDate(iso).toLocaleString('ru-RU', withDeviceTimeZone({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }))
}

const URL_SPLIT_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
const URL_CHECK_RE = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i

export interface TextChunk {
  kind: 'text' | 'link'
  value: string
  /** Link only: where it points, with a scheme added to bare www links. */
  href?: string
  /** Link only: punctuation that followed the link and is not part of it. */
  trailing?: string
}

/**
 * Splits a message into text and links.
 *
 * Trailing punctuation is peeled off the link, otherwise a sentence-ending
 * full stop becomes part of the address and the link breaks.
 */
export function splitUrls(text: string): TextChunk[] {
  return text.split(URL_SPLIT_RE).reduce<TextChunk[]>((acc, chunk) => {
    if (!chunk) return acc
    if (!URL_CHECK_RE.test(chunk)) {
      acc.push({ kind: 'text', value: chunk })
      return acc
    }
    let core = chunk
    let trailing = ''
    while (core && /[),.;!?]$/.test(core)) {
      trailing = core.slice(-1) + trailing
      core = core.slice(0, -1)
    }
    if (!core) {
      acc.push({ kind: 'text', value: chunk })
      return acc
    }
    acc.push({
      kind: 'link',
      value: core,
      href: core.startsWith('www.') ? `https://${core}` : core,
      trailing: trailing || undefined,
    })
    return acc
  }, [])
}

function minutesUntilTomorrow9am(): number {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return Math.ceil((tomorrow.getTime() - now.getTime()) / 60_000)
}

/** The three delays the app offers, unchanged from the old card. */
export const SNOOZE_OPTIONS = [
  { label: '1 час', minutes: () => 60 },
  { label: '3 часа', minutes: () => 180 },
  { label: 'Завтра утром', minutes: minutesUntilTomorrow9am },
]

/** Priority cycle order, as clicking the priority badge walked it. */
export const PRIORITY_ORDER: TaskPriority[] = ['normal', 'high', 'medium', 'low']

export function nextPriority(current: TaskPriority): TaskPriority {
  const idx = PRIORITY_ORDER.indexOf(current)
  return PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length]
}
