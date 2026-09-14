import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (next: string) => void
}

/** Telegram input: no box, a line underneath that turns accent on focus. */
export function TgTextField({ value, onChange, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full border-0 border-b border-tg-divider bg-transparent px-0 py-1',
        'text-tg-box text-tg-text outline-none',
        'transition-colors duration-tg-menu',
        'placeholder:text-tg-placeholder',
        'focus:border-tg-line-active',
        className,
      )}
    />
  )
}
