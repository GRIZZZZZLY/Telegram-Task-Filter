import { cn } from '@/lib/utils'

export interface TgSegmentedOption {
  id: string
  label: string
}

interface Props {
  options: TgSegmentedOption[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** Two or three exclusive choices, as Telegram shows small mode switches. */
export function TgSegmented({ options, active, onChange, className }: Props) {
  return (
    <div className={cn('flex overflow-hidden rounded-tg-btn border border-tg-divider', className)}>
      {options.map((opt, i) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={opt.id === active}
          className={cn(
            'px-2.5 py-1 text-tg-sm transition-colors duration-tg-universal',
            i > 0 && 'border-l border-tg-divider',
            opt.id === active
              ? 'bg-tg-accent text-tg-on-accent'
              : 'text-tg-text-sub hover:bg-tg-bg-over',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
