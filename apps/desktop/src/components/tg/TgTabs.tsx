import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'
import { TgBadge } from './TgBadge'

export interface TgTabItem {
  id: string
  label: string
  count?: number
}

interface Props {
  items: TgTabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/**
 * Telegram section switch: an underline that slides, not a moving pill.
 * The indicator is positioned from measured tab geometry, so labels of
 * different widths stay correct.
 */
export function TgTabs({ items, active, onChange, className }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const [ink, setInk] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab-id="${active}"]`)
      if (el) setInk({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [active, items])

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn('relative flex border-b border-tg-divider bg-tg-bg', className)}
    >
      {items.map((item) => (
        <TabButton
          key={item.id}
          item={item}
          active={item.id === active}
          onSelect={() => onChange(item.id)}
        />
      ))}

      <span
        aria-hidden="true"
        className="absolute bottom-0 h-0.5 rounded-t-sm bg-tg-accent transition-[transform,width] duration-tg-menu ease-out"
        style={{ width: ink.width, transform: `translateX(${ink.left}px)` }}
      />
    </div>
  )
}

function TabButton({
  item,
  active,
  onSelect,
}: {
  item: TgTabItem
  active: boolean
  onSelect: () => void
}) {
  const ripple = useRipple()

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-tab-id={item.id}
      onClick={onSelect}
      {...ripple}
      className={cn(
        'relative flex flex-1 items-center justify-center gap-1.5 overflow-hidden',
        'px-1 pb-2.5 pt-[11px] text-tg-base font-semibold',
        'transition-colors duration-tg-menu',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-tg-accent',
        active ? 'text-tg-accent-text' : 'text-tg-text-sub hover:text-tg-text-bold',
      )}
    >
      {item.label}
      {item.count !== undefined && <TgBadge count={item.count} muted={!active} />}
    </button>
  )
}
