import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { TG_MS } from '@/lib/tg-motion'
import { menuPosition } from './menu-position'
import type { MenuPosition } from './menu-position'
import { useRipple } from './useRipple'

export interface TgMenuItem {
  id: string
  label: string
  icon?: ReactNode
  /** Destructive action: red label and icon. */
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface Props {
  open: boolean
  /** Click point in viewport coordinates, or null when closed. */
  anchor: { x: number; y: number } | null
  onClose: () => void
  items: TgMenuItem[]
}

/**
 * Telegram popup menu: 8px radius, 156px minimum width, item padding
 * 17/8/17/7, and it grows from the corner nearest the click.
 */
export function TgPopupMenu({ open, anchor, onClose, items }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<MenuPosition>({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
  })

  // Measure after mount, before paint, so the menu never flashes in the
  // wrong place on its way to the right one.
  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(menuPosition({
      x: anchor.x,
      y: anchor.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }))
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || !anchor) return null

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        transformOrigin: `${pos.originY} ${pos.originX}`,
        animationDuration: `${TG_MS.menuShow}ms`,
      }}
      className={cn(
        'z-[9999] min-w-[156px] max-w-[300px] overflow-hidden py-2',
        'rounded-tg-box bg-tg-menu-bg text-tg-text',
        'shadow-[0_1px_3px_var(--tg-shadow),0_8px_24px_var(--tg-shadow)]',
        'animate-[tg-menu-in_200ms_ease-out]',
      )}
    >
      {items.map((item) => (
        <MenuItem key={item.id} item={item} onClose={onClose} />
      ))}
    </div>,
    document.body,
  )
}

function MenuItem({ item, onClose }: { item: TgMenuItem; onClose: () => void }) {
  const ripple = useRipple()

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        item.onSelect()
        onClose()
      }}
      {...ripple}
      className={cn(
        'relative flex w-full items-center gap-[10px] overflow-hidden',
        'px-[17px] pb-[7px] pt-2 text-left text-tg-base',
        'transition-colors duration-tg-universal',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        'disabled:pointer-events-none disabled:text-tg-menu-disabled',
        item.danger
          ? 'text-tg-danger hover:bg-[var(--tg-danger-bg-over)]'
          : 'text-tg-text hover:bg-tg-bg-over',
      )}
    >
      {item.icon && (
        <span className={cn('flex-none', item.danger ? 'text-tg-danger' : 'text-tg-menu-icon')}>
          {item.icon}
        </span>
      )}
      {item.label}
    </button>
  )
}
