import { describe, it, expect } from 'vitest'
import { rippleGeometry } from './ripple-geometry'

describe('rippleGeometry', () => {
  it('reaches the far corner when pressed in the centre', () => {
    const g = rippleGeometry(100, 100, 50, 50)
    // distance from centre to a corner of a 100x100 box
    expect(g.size).toBeCloseTo(Math.hypot(50, 50) * 2, 5)
    expect(g.left).toBeCloseTo(50 - Math.hypot(50, 50), 5)
    expect(g.top).toBeCloseTo(50 - Math.hypot(50, 50), 5)
  })

  it('reaches the opposite corner when pressed in a corner', () => {
    const g = rippleGeometry(100, 100, 0, 0)
    expect(g.size).toBeCloseTo(Math.hypot(100, 100) * 2, 5)
  })

  it('covers a wide row pressed near its right edge', () => {
    const g = rippleGeometry(400, 60, 390, 30)
    expect(g.size).toBeCloseTo(Math.hypot(390, 30) * 2, 5)
  })

  it('never returns a zero size', () => {
    const g = rippleGeometry(0, 0, 0, 0)
    expect(g.size).toBeGreaterThan(0)
  })
})
