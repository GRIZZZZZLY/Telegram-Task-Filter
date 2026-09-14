import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  /** First block on the screen: no divider above it. */
  first?: boolean
  children: ReactNode
}

/**
 * A block of Telegram settings: a thick strip, then a coloured title, then
 * the rows. Telegram separates settings groups by a band, not by a card.
 */
export function TgSection({ title, first = false, children }: Props) {
  return (
    <section>
      {!first && (
        <div className="h-2 border-y border-tg-divider bg-tg-bg-over" aria-hidden="true" />
      )}
      <h2
        className={cn(
          'px-[22px] pb-1.5 text-tg-base font-semibold text-tg-accent-text',
          first ? 'pt-3' : 'pt-3.5',
        )}
      >
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}
