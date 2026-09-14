import { cn } from '@/lib/utils'

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name. Required: a switch with no name is unusable by screen reader. */
  label: string
  disabled?: boolean
  className?: string
}

/**
 * Telegram switch: an outlined track with a filled knob, 120ms.
 * Not the iOS pill, which is what the old Settings screen used.
 */
export function TgToggle({ checked, onChange, label, disabled = false, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-[34px] flex-none rounded-[10px] border-2 bg-transparent p-0',
        'transition-colors duration-tg-universal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tg-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        checked ? 'border-tg-accent' : 'border-tg-checkbox-off',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-px top-px block h-3.5 w-3.5 rounded-full',
          'transition-[transform,background-color] duration-tg-universal ease-in-out',
          checked ? 'translate-x-[14px] bg-tg-accent' : 'translate-x-0 bg-tg-checkbox-off',
        )}
      />
    </button>
  )
}
