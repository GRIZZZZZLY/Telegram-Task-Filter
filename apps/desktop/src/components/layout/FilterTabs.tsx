import { motion } from 'framer-motion'
import type { TabId } from '@/types/task'

export type { TabId }

const TABS: { id: TabId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'done', label: 'Done' },
  { id: 'snoozed', label: 'Snoozed' },
]

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
  counts?: Partial<Record<TabId, number>>
}

export function FilterTabs({ active, onChange, counts = {} }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-muted/40 p-1 backdrop-blur-sm">
      {TABS.map((tab) => {
        const isActive = tab.id === active
        const count = counts[tab.id]

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            {isActive && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute inset-0 rounded-lg bg-background shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span
              className={[
                'relative z-10 transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
              ].join(' ')}
            >
              {tab.label}
            </span>
            {count !== undefined && count > 0 && (
              <span
                className={[
                  'relative z-10 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  isActive
                    ? 'bg-indigo-500 text-white'
                    : 'bg-muted-foreground/20 text-muted-foreground',
                ].join(' ')}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
