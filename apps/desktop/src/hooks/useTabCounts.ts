/**
 * Polls Done and Snoozed task counts every 30 seconds.
 * Inbox count is managed by TaskList via onInboxCountChange.
 */
import { useCallback, useEffect, useState } from 'react'
import { getTasks } from '@/api/tasks'

interface TabCounts {
  done: number
  snoozed: number
}

export function useTabCounts(): TabCounts {
  const [counts, setCounts] = useState<TabCounts>({ done: 0, snoozed: 0 })

  const refresh = useCallback(async () => {
    try {
      const [done, snoozed] = await Promise.all([
        getTasks({ status: 'done', limit: 1 }), // API rejects limit=0 (422); only `total` is used
        getTasks({ status: 'snoozed', limit: 1 }), // API rejects limit=0 (422); only `total` is used
      ])
      setCounts({ done: done.total, snoozed: snoozed.total })
    } catch {
      // Backend unreachable — keep stale counts
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(interval)
  }, [refresh])

  return counts
}
