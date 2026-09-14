import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** Used for both the tooltip and the accessible name. */
  label: string
  /** Button diameter in pixels. Telegram uses 30 in bars, 40 in menus. */
  size?: number
  children: ReactNode
}

export function TgIconButton({ label, size = 30, className, children, ...rest }: Props) {
  const ripple = useRipple()

  return (
    <button
      {...rest}
      {...ripple}
      title={label}
      aria-label={label}
      style={{ width: size, height: size, ...rest.style }}
      className={cn(
        'relative grid flex-none place-items-center overflow-hidden rounded-full',
        'text-tg-menu-icon hover:bg-tg-bg-over hover:text-tg-text-bold',
        'transition-colors duration-tg-universal',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tg-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}
