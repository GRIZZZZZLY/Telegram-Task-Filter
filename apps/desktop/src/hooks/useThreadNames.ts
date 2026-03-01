import { useEffect, useMemo, useState } from 'react'
import { getTgThreads } from '@/api/settings'
import type { Task } from '@/types/task'

// key format: `${chatId}:${threadId}` -> thread name
export function useThreadNames(tasks: Task[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map())

  // Stable key: sorted unique "chatId:threadId" pairs joined as a string.
  // Changes only when the actual set of chat+thread pairs changes,
  // NOT on every task status / priority update.
  const stableKey = useMemo(() => {
    const pairs = new Set(
      tasks
        .filter((t) => t.thread_id)
        .map((t) => `${t.chat_id}:${t.thread_id}`),
    )
    return [...pairs].sort().join(',')
  }, [tasks])

  useEffect(() => {
    if (!stableKey) {
      setMap(new Map())
      return
    }

    // Extract unique chat IDs that have at least one threaded task
    const chatIds = Array.from(new Set(
      tasks
        .filter((t) => !!t.thread_id)
        .map((t) => t.chat_id)
        .filter(Boolean),
    ))

    if (chatIds.length === 0) return

    let cancelled = false

    Promise.all(chatIds.map(async (chatId) => {
      try {
        const threads = await getTgThreads(chatId)
        return { chatId, threads }
      } catch {
        return { chatId, threads: [] as Array<{ id: string; name: string }> }
      }
    })).then((results) => {
      if (cancelled) return
      const next = new Map<string, string>()
      for (const r of results) {
        for (const thread of r.threads) {
          next.set(`${r.chatId}:${thread.id}`, thread.name)
        }
      }
      setMap(next)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey])

  return map
}
