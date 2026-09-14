import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

interface Props {
  /** Selected row, as in Telegram's chat list: solid accent background. */
  selected?: boolean
  onActivate?: () => void
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
  className?: string
  children: ReactNode
}

/**
 * A row of the Telegram list: no border, no radius, no card. Separation comes
 * from a one-pixel divider; feedback comes from hover and ripple.
 */
export function TgRow({ selected = false, onActivate, onContextMenu, className, children }: Props) {
  const ripple = useRipple()

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onActivate?.()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      {...ripple}
      className={cn(
        'relative cursor-pointer overflow-hidden border-b border-tg-divider',
        'transition-colors duration-tg-universal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tg-accent',
        selected
          ? 'bg-tg-row-active text-tg-row-active-text [--tg-ripple-color:rgb(var(--tg-row-active-ripple))]'
          : 'hover:bg-tg-row-over [--tg-ripple-color:rgb(var(--tg-row-ripple))]',
        className,
      )}
    >
      {children}
    </div>
  )
}
