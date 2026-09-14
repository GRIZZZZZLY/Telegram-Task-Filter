import { describe, it, expect } from 'vitest'
import {
  normalizeCsvToken,
  parseCsvIds,
  deserializeThreadSelection,
  serializeThreadSelection,
  countSelectedThreads,
  removeChatFromSelection,
  toggleThreadInSelection,
} from './thread-selection'

describe('normalizeCsvToken', () => {
  it('trims spaces and strips surrounding quotes', () => {
    expect(normalizeCsvToken('  "-100123"  ')).toBe('-100123')
    expect(normalizeCsvToken("'-100123'")).toBe('-100123')
  })
})

describe('parseCsvIds', () => {
  it('splits and drops empty entries', () => {
    expect(parseCsvIds('-100123, -100456 ,,')).toEqual(['-100123', '-100456'])
  })

  it('returns an empty list for an empty string', () => {
    expect(parseCsvIds('')).toEqual([])
  })
})

describe('deserializeThreadSelection', () => {
  it('reads chat:thread pairs', () => {
    const map = deserializeThreadSelection('-100123:5,-100123:7,-100456:2')
    expect([...map.keys()].sort()).toEqual(['-100123', '-100456'])
    expect([...map.get('-100123')!].sort()).toEqual(['5', '7'])
  })

  it('splits on the last colon, so a chat id may contain one', () => {
    const map = deserializeThreadSelection('a:b:9')
    expect(map.get('a:b')).toEqual(new Set(['9']))
  })

  it('ignores the old flat format and malformed tokens', () => {
    const map = deserializeThreadSelection('123,:,abc:,:7,')
    expect(map.size).toBe(0)
  })
})

describe('serializeThreadSelection', () => {
  it('round-trips through deserialize', () => {
    const csv = '-100123:5,-100123:7,-100456:2'
    const again = serializeThreadSelection(deserializeThreadSelection(csv))
    expect(deserializeThreadSelection(again)).toEqual(deserializeThreadSelection(csv))
  })

  it('returns an empty string for an empty map', () => {
    expect(serializeThreadSelection(new Map())).toBe('')
  })
})

describe('countSelectedThreads', () => {
  it('counts across all chats', () => {
    expect(countSelectedThreads(deserializeThreadSelection('a:1,a:2,b:3'))).toBe(3)
  })
})

describe('removeChatFromSelection', () => {
  it('drops every thread of that chat and leaves the others', () => {
    const map = deserializeThreadSelection('a:1,a:2,b:3')
    const next = removeChatFromSelection(map, 'a')
    expect(next.has('a')).toBe(false)
    expect(next.get('b')).toEqual(new Set(['3']))
  })

  it('does not mutate the input', () => {
    const map = deserializeThreadSelection('a:1')
    removeChatFromSelection(map, 'a')
    expect(map.has('a')).toBe(true)
  })
})

describe('toggleThreadInSelection', () => {
  it('adds a thread that was not selected', () => {
    const next = toggleThreadInSelection(new Map(), 'a', '1')
    expect(next.get('a')).toEqual(new Set(['1']))
  })

  it('removes a thread that was selected', () => {
    const map = deserializeThreadSelection('a:1,a:2')
    const next = toggleThreadInSelection(map, 'a', '1')
    expect(next.get('a')).toEqual(new Set(['2']))
  })

  it('drops the chat entirely when its last thread is removed', () => {
    const map = deserializeThreadSelection('a:1')
    const next = toggleThreadInSelection(map, 'a', '1')
    expect(next.has('a')).toBe(false)
  })
})
