import { describe, it, expect } from 'vitest'
import {
  buildTgLinks,
  formatChatLabel,
  splitUrls,
  nextPriority,
  SNOOZE_OPTIONS,
} from './task-format'

describe('buildTgLinks', () => {
  it('builds a private-channel link for a -100 supergroup id', () => {
    const links = buildTgLinks('-1001234567890', 42)
    expect(links.deep).toBe('tg://privatepost?channel=1234567890&post=42')
    expect(links.web).toBe('https://t.me/c/1234567890/42')
  })

  it('builds a username link for a non-numeric id', () => {
    const links = buildTgLinks('@durov', 7)
    expect(links.deep).toBe('tg://resolve?domain=durov&post=7')
    expect(links.web).toBe('https://t.me/durov/7')
  })

  it('keeps the legacy shape for a positive numeric id', () => {
    const links = buildTgLinks('12345', 3)
    expect(links.deep).toBe('https://t.me/12345/3')
    expect(links.web).toBe('https://t.me/12345/3')
  })
})

describe('formatChatLabel', () => {
  it('shortens a negative chat id to its last four digits', () => {
    expect(formatChatLabel('-1001234567890')).toBe('чат …7890')
  })

  it('leaves a username alone', () => {
    expect(formatChatLabel('@team')).toBe('@team')
  })
})

describe('splitUrls', () => {
  it('returns plain text as a single chunk', () => {
    const parts = splitUrls('просто текст')
    expect(parts).toEqual([{ kind: 'text', value: 'просто текст' }])
  })

  it('finds a link and gives it an href', () => {
    const parts = splitUrls('см. https://example.com дальше')
    const link = parts.find((p) => p.kind === 'link')
    expect(link?.value).toBe('https://example.com')
    expect(link?.href).toBe('https://example.com')
  })

  it('adds a scheme to a bare www link', () => {
    const parts = splitUrls('www.example.com')
    expect(parts[0].href).toBe('https://www.example.com')
  })

  it('keeps trailing punctuation out of the link', () => {
    const parts = splitUrls('открой https://example.com.')
    const link = parts.find((p) => p.kind === 'link')
    expect(link?.value).toBe('https://example.com')
    expect(link?.trailing).toBe('.')
  })

  it('keeps a closing bracket out of the link', () => {
    const parts = splitUrls('(https://example.com)')
    const link = parts.find((p) => p.kind === 'link')
    expect(link?.value).toBe('https://example.com')
    expect(link?.trailing).toBe(')')
  })
})

describe('nextPriority', () => {
  it('cycles normal → high → medium → low → normal', () => {
    expect(nextPriority('normal')).toBe('high')
    expect(nextPriority('high')).toBe('medium')
    expect(nextPriority('medium')).toBe('low')
    expect(nextPriority('low')).toBe('normal')
  })
})

describe('SNOOZE_OPTIONS', () => {
  it('offers exactly the three Telegram-style delays', () => {
    expect(SNOOZE_OPTIONS.map((o) => o.label)).toEqual(['1 час', '3 часа', 'Завтра утром'])
  })

  it('gives an hour and three hours in minutes', () => {
    expect(SNOOZE_OPTIONS[0].minutes()).toBe(60)
    expect(SNOOZE_OPTIONS[1].minutes()).toBe(180)
  })

  it('gives tomorrow morning as a positive number of minutes under two days', () => {
    const m = SNOOZE_OPTIONS[2].minutes()
    expect(m).toBeGreaterThan(0)
    expect(m).toBeLessThan(48 * 60)
  })
})
