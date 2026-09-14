import { peerColorVar } from '@/lib/peer-color'
import { cn } from '@/lib/utils'

interface Props {
  /** Display name; its initials go inside the circle. */
  name: string
  /** What the colour is derived from — the chat id, so a chat keeps its colour. */
  colorKey: string
  size?: number
  className?: string
}

/** Up to two initials, the way Telegram builds them from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function TgAvatar({ name, colorKey, size = 34, className }: Props) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: peerColorVar(colorKey) }}
      className={cn(
        'grid flex-none place-items-center rounded-full font-semibold text-white',
        size >= 34 ? 'text-tg-base' : 'text-tg-sm',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
