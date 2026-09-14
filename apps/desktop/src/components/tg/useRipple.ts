import { useCallback } from 'react'
import type React from 'react'
import { rippleGeometry } from './ripple-geometry'
import { TG_MS } from '@/lib/tg-motion'

/**
 * Telegram ripple as a hook.
 *
 * Spread the result onto an element that is `relative` and `overflow-hidden`.
 * The ripple element is created on press and removed after it has faded, so
 * nothing accumulates in the DOM.
 *
 * Colour is taken from the CSS custom property --tg-ripple-color on the
 * element, so a button and a list row can ripple in their own colours
 * without the hook knowing about either.
 */
export function useRipple() {
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const host = e.currentTarget
    const rect = host.getBoundingClientRect()
    const { size, left, top } = rippleGeometry(
      rect.width,
      rect.height,
      e.clientX - rect.left,
      e.clientY - rect.top,
    )

    const circle = document.createElement('span')
    circle.className = 'tg-ripple'
    circle.style.width = `${size}px`
    circle.style.height = `${size}px`
    circle.style.left = `${left}px`
    circle.style.top = `${top}px`
    host.appendChild(circle)

    let done = false
    const release = () => {
      if (done) return
      done = true
      circle.dataset.released = 'true'
      window.setTimeout(() => circle.remove(), TG_MS.rippleIn + TG_MS.rippleOut)
      host.removeEventListener('pointerup', release)
      host.removeEventListener('pointerleave', release)
      host.removeEventListener('pointercancel', release)
    }

    host.addEventListener('pointerup', release)
    host.addEventListener('pointerleave', release)
    host.addEventListener('pointercancel', release)
  }, [])

  return { onPointerDown }
}
