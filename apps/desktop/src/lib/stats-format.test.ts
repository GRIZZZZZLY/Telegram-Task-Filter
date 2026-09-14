import { describe, it, expect } from 'vitest'
import { formatMinutes, shortChatId } from './stats-format'

describe('formatMinutes', () => {
  it('shows a dash when there is nothing to show', () => {
    expect(formatMinutes(null)).toBe('—')
  })

  it('shows minutes under an hour', () => {
    expect(formatMinutes(0)).toBe('0 мин')
    expect(formatMinutes(59)).toBe('59 мин')
    expect(formatMinutes(12.4)).toBe('12 мин')
  })

  it('shows whole hours without minutes', () => {
    expect(formatMinutes(60)).toBe('1 ч')
    expect(formatMinutes(120)).toBe('2 ч')
  })

  it('shows hours and minutes together', () => {
    expect(formatMinutes(90)).toBe('1 ч 30 мин')
    expect(formatMinutes(605)).toBe('10 ч 5 мин')
  })
})

describe('shortChatId', () => {
  it('shortens a supergroup id to its last four digits', () => {
    expect(shortChatId('-1001234567890')).toBe('…7890')
  })

  it('keeps the tail of a non-numeric id', () => {
    expect(shortChatId('@teamchat')).toBe('amchat')
  })
})
