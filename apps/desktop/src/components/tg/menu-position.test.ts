import { describe, it, expect } from 'vitest'
import { menuPosition } from './menu-position'

const VIEW = { viewportWidth: 420, viewportHeight: 680 }

describe('menuPosition', () => {
  it('opens down and to the right when there is room', () => {
    const p = menuPosition({ x: 40, y: 100, menuWidth: 160, menuHeight: 200, ...VIEW })
    expect(p.left).toBe(40)
    expect(p.top).toBe(100)
    expect(p.originX).toBe('left')
    expect(p.originY).toBe('top')
  })

  it('flips to the left when the menu would run past the right edge', () => {
    const p = menuPosition({ x: 400, y: 100, menuWidth: 160, menuHeight: 200, ...VIEW })
    expect(p.left).toBe(400 - 160)
    expect(p.originX).toBe('right')
  })

  it('flips upward when the menu would run past the bottom edge', () => {
    const p = menuPosition({ x: 40, y: 600, menuWidth: 160, menuHeight: 200, ...VIEW })
    expect(p.top).toBe(600 - 200)
    expect(p.originY).toBe('bottom')
  })

  it('never positions the menu off the top or left edge', () => {
    const p = menuPosition({ x: 2, y: 2, menuWidth: 300, menuHeight: 600, ...VIEW })
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })

  it('keeps a menu taller than the window inside the window', () => {
    const p = menuPosition({ x: 40, y: 300, menuWidth: 160, menuHeight: 900, ...VIEW })
    expect(p.top).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeLessThanOrEqual(VIEW.viewportHeight)
  })
})
