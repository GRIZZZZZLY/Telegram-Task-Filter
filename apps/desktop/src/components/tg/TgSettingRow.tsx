import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

interface Props {
  label: string
  hint?: string
  /** Makes the whole row pressable, as Telegram does for rows that open something. */
  onClick?: () => void
  /** Control on the right: a switch, a field, a button. */
  children?: ReactNode
  className?: string
}

/** One setting: label and optional hint on the left, control on the right. */
export function TgSettingRow({ label, hint, onClick, children, className }: Props) {
  const ripple = useRipple()

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-tg-box text-tg-text-bold">{label}</span>
        {hint && <span className="mt-0.5 block text-tg-sm text-tg-text-sub">{hint}</span>}
      </span>
      {children && <span className="flex flex-none items-center gap-2">{children}</span>}
    </>
  )

  if (!onClick) {
    return (
      <div className={cn('flex items-center gap-3 px-[22px] pb-2 pt-2.5', className)}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      {...ripple}
      className={cn(
        'relative flex items-center gap-3 overflow-hidden px-[22px] pb-2 pt-2.5 text-left',
        'transition-colors duration-tg-universal hover:bg-tg-bg-over',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        className,
      )}
    >
      {content}
    </button>
  )
}
