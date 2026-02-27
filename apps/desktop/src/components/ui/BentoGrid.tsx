/**
 * Bento Grid — Magic UI inspired
 * Адаптировано для списка задач с динамическим col-span по приоритету
 */
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface BentoGridProps {
  className?: string
  children: ReactNode
}

export function BentoGrid({ className, children }: BentoGridProps) {
  return (
    <div
      className={cn(
        'grid auto-rows-auto grid-cols-3 gap-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface BentoCardProps {
  className?: string
  children: ReactNode
  colSpan?: 1 | 2 | 3
}

export function BentoCard({ className, children, colSpan = 1 }: BentoCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/50',
        'bg-card/60 p-4 backdrop-blur-sm',
        'transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-lg',
        colSpan === 2 && 'col-span-2',
        colSpan === 3 && 'col-span-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
