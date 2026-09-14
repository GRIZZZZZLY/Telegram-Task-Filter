import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TgTitleBar } from './TgTitleBar'

interface Props {
  title?: string
  className?: string
  children: ReactNode
}

/**
 * Every screen sits in one of these: title strip on top, content below.
 *
 * The old layout had the window buttons floating over the content, so each
 * screen carried a 120px empty gutter to keep them clickable. That gutter
 * disappears with this frame.
 */
export function TgWindowFrame({ title, className, children }: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-tg-bg text-tg-text">
      <TgTitleBar title={title} />
      <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
        {children}
      </div>
    </div>
  )
}
