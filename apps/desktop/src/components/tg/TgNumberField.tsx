import { cn } from '@/lib/utils'

interface Props {
  value: number
  onChange: (next: number) => void
  min: number
  max: number
  className?: string
}

/** Small numeric field for settings; clamps to the allowed range. */
export function TgNumberField({ value, onChange, min, max, className }: Props) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const raw = Number(e.target.value)
        if (Number.isNaN(raw)) return
        onChange(Math.max(min, Math.min(max, raw)))
      }}
      className={cn(
        'w-16 rounded-tg-btn border border-tg-divider bg-transparent px-2 py-1',
        'text-center text-tg-base text-tg-text outline-none',
        'transition-colors duration-tg-menu focus:border-tg-line-active',
        className,
      )}
    />
  )
}
