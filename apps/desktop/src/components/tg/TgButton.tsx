import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

type Variant = 'active' | 'light' | 'attention'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** active: filled accent. light: quiet text button. attention: destructive. */
  variant?: Variant
  fullWidth?: boolean
  children: ReactNode
}

/** Telegram RoundButton: 34px tall, 4px radius, semibold label. */
const VARIANTS: Record<Variant, string> = {
  active:
    'bg-tg-btn text-tg-on-accent hover:bg-tg-btn-over [--tg-ripple-color:rgb(var(--tg-btn-ripple))]',
  light:
    'bg-transparent text-tg-btn-light-text hover:bg-tg-btn-light-over [--tg-ripple-color:rgb(var(--tg-btn-light-ripple))]',
  attention:
    'bg-transparent text-tg-danger hover:bg-[var(--tg-danger-bg-over)] [--tg-ripple-color:var(--tg-danger-ripple)]',
}

export function TgButton({
  variant = 'active',
  fullWidth = false,
  className,
  children,
  ...rest
}: Props) {
  const ripple = useRipple()

  return (
    <button
      {...rest}
      {...ripple}
      className={cn(
        'relative flex h-[34px] items-center justify-center gap-[7px] overflow-hidden',
        'rounded-tg-btn px-4 text-tg-base font-semibold',
        'transition-colors duration-tg-universal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tg-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  )
}
