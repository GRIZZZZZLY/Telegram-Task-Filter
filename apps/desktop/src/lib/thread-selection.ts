/**
 * How the monitored chats and threads are stored.
 *
 * Chats: "id,id,id".
 * Threads: "chatId:threadId,chatId:threadId".
 *
 * The pair is split on the LAST colon, so a chat id that contains one still
 * parses. Tokens from the old flat format have no colon and are ignored
 * rather than guessed at.
 */

/** Trim spaces and strip quotes a CSV editor may have left behind. */
export function normalizeCsvToken(value: string): string {
  return value.trim().replace(/^['"]+|['"]+$/g, '')
}

/** Split a comma-separated id list, dropping empties. */
export function parseCsvIds(value: string): string[] {
  return value.split(',').map(normalizeCsvToken).filter(Boolean)
}

/** "chatId:threadId" CSV → Map<chatId, Set<threadId>> */
export function deserializeThreadSelection(csv: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const raw of csv.split(',')) {
    const token = raw.trim()
    if (!token) continue
    const colonIdx = token.lastIndexOf(':')
    if (colonIdx <= 0) continue // old flat format or malformed — ignore
    const chatId = token.slice(0, colonIdx)
    const threadId = token.slice(colonIdx + 1)
    if (!chatId || !threadId) continue
    if (!map.has(chatId)) map.set(chatId, new Set())
    map.get(chatId)!.add(threadId)
  }
  return map
}

/** Map<chatId, Set<threadId>> → "chatId:threadId" CSV */
export function serializeThreadSelection(map: Map<string, Set<string>>): string {
  const pairs: string[] = []
  for (const [chatId, threadIds] of map) {
    for (const threadId of threadIds) {
      pairs.push(`${chatId}:${threadId}`)
    }
  }
  return pairs.join(',')
}

/** Total number of selected threads across every chat. */
export function countSelectedThreads(map: Map<string, Set<string>>): number {
  let total = 0
  for (const set of map.values()) total += set.size
  return total
}

/** A copy without that chat — used when a group is unticked. */
export function removeChatFromSelection(
  map: Map<string, Set<string>>,
  chatId: string,
): Map<string, Set<string>> {
  const next = new Map(map)
  next.delete(chatId)
  return next
}

/** A copy with that thread flipped; a chat with no threads left disappears. */
export function toggleThreadInSelection(
  map: Map<string, Set<string>>,
  chatId: string,
  threadId: string,
): Map<string, Set<string>> {
  const next = new Map(map)
  const set = new Set(next.get(chatId) ?? [])
  if (set.has(threadId)) set.delete(threadId)
  else set.add(threadId)
  if (set.size === 0) next.delete(chatId)
  else next.set(chatId, set)
  return next
}
