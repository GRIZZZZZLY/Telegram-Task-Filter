/**
 * useChatNames — loads Telegram chat names once and caches them in memory.
 *
 * Returns a Map<chatId, displayName> so TaskCard can show real chat names
 * instead of "чат …1234".
 *
 * - Fetches GET /telegram/chats on mount (lazy — only when Telegram session is ready)
 * - Silently ignores errors (backend may not have a session yet)
 * - Re-fetches when `refreshKey` changes (e.g. after settings are saved)
 */
import { useEffect, useState } from 'react'
import { getTgChats } from '@/api/settings'

// Module-level cache so multiple component instances share the same data
let _cache: Map<string, string> | null = null

export function useChatNames(refreshKey?: number): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(_cache ?? new Map())

  useEffect(() => {
    // If we have a cache and no explicit refresh requested, skip fetch
    if (_cache !== null && refreshKey === undefined) {
      setNames(_cache)
      return
    }

    getTgChats()
      .then((chats) => {
        const map = new Map<string, string>()
        for (const chat of chats) {
          map.set(chat.id, chat.name)
        }
        _cache = map
        setNames(map)
      })
      .catch(() => {
        // Telegram session may not be ready — use empty map (fallback labels shown)
      })
  }, [refreshKey])

  return names
}
