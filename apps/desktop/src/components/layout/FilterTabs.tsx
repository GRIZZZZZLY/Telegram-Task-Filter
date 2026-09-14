import { TgTabs } from '@/components/tg'
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
    <TgTabs
      items={TABS.map((tab) => ({ ...tab, count: counts[tab.id] }))}
      active={active}
      onChange={(id) => onChange(id as TabId)}
    />
  )
}
