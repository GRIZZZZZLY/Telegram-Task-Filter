import { cn } from '@/lib/utils'

interface Props {
  count: number
  /** Muted grey, as Telegram shows counters for muted chats. */
  muted?: boolean
  className?: string
}

/** Telegram unread counter: pill shaped, tabular digits, hidden when empty. */
export function TgBadge({ count, muted = false, className }: Props) {
  if (count <= 0) return null

  return (
    <span
      className={cn(
        'inline-grid h-[18px] min-w-[18px] place-items-center rounded-[9px] px-[5px]',
        'text-[11px] font-semibold tabular-nums text-tg-badge-text',
        'transition-colors duration-tg-tabs',
        muted ? 'bg-tg-badge-muted' : 'bg-tg-badge',
        className,
      )}
    >
      {count > 999 ? '999+' : count}
    </span>
  )
}
