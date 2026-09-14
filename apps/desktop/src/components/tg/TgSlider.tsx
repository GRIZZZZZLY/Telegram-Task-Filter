import { cn } from '@/lib/utils'

interface Props {
  value: number
  onChange: (next: number) => void
  min: number
  max: number
  step?: number
  className?: string
}

/** Range slider using Telegram's accent for the filled part. */
export function TgSlider({ value, onChange, min, max, step = 1, className }: Props) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('h-1.5 w-24 cursor-pointer accent-tg-accent', className)}
    />
  )
}
