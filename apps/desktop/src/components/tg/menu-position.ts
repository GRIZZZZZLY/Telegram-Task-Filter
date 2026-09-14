export interface MenuPositionArgs {
  /** Click point, in viewport coordinates. */
  x: number
  y: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  /** Minimum gap to the window edge. */
  margin?: number
}

export interface MenuPosition {
  left: number
  top: number
  /** Which corner the opening animation grows from. */
  originX: 'left' | 'right'
  originY: 'top' | 'bottom'
}

/**
 * Where a popup menu goes so that it stays on screen.
 *
 * The window is 420px wide at its default size, so a menu opened near the
 * right edge has to flip rather than be clipped.
 */
export function menuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
}: MenuPositionArgs): MenuPosition {
  const flipX = x + menuWidth > viewportWidth - margin
  const flipY = y + menuHeight > viewportHeight - margin

  const rawLeft = flipX ? x - menuWidth : x
  const rawTop = flipY ? y - menuHeight : y

  return {
    left: Math.max(margin, Math.min(rawLeft, viewportWidth - menuWidth - margin)),
    top: Math.max(margin, Math.min(rawTop, viewportHeight - menuHeight - margin)),
    originX: flipX ? 'right' : 'left',
    originY: flipY ? 'bottom' : 'top',
  }
}
