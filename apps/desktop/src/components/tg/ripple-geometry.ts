/**
 * Geometry of a Telegram ripple.
 *
 * The circle starts at the press point and has to reach the furthest corner
 * of the element, otherwise it stops short of a corner and looks clipped.
 */
export interface RippleGeometry {
  /** Diameter in pixels. */
  size: number
  /** Left offset relative to the element. */
  left: number
  /** Top offset relative to the element. */
  top: number
}

export function rippleGeometry(
  width: number,
  height: number,
  x: number,
  y: number,
): RippleGeometry {
  const radius = Math.max(
    Math.hypot(Math.max(x, width - x), Math.max(y, height - y)),
    1,
  )
  return { size: radius * 2, left: x - radius, top: y - radius }
}
