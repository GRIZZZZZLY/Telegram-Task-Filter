import { describe, it, expect } from 'vitest'
import { peerColorIndex, peerColorVar } from './peer-color'

describe('peerColorIndex', () => {
  it('returns a value between 1 and 8 for any id', () => {
    const ids = ['-1001234567890', '42', '', 'abc', '-999999999999999']
    for (const id of ids) {
      const n = peerColorIndex(id)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(8)
      expect(Number.isInteger(n)).toBe(true)
    }
  })

  it('gives the same id the same colour every time', () => {
    expect(peerColorIndex('-1001234567890')).toBe(peerColorIndex('-1001234567890'))
  })

  it('spreads ids across more than one colour', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(peerColorIndex(`-100${i}`))
    expect(seen.size).toBeGreaterThan(4)
  })

  it('builds a css colour expression', () => {
    const css = peerColorVar('-1001234567890')
    expect(css).toMatch(/^rgb\(var\(--tg-peer-[1-8]\)\)$/)
  })
})
