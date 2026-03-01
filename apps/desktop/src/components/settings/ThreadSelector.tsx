/**
 * ThreadSelector — Two-accordion UI for selecting monitored groups and threads.
 *
 * Accordion 1 (Группы):
 *   - Search input for groups
 *   - Checkbox list of all available Telegram supergroups
 *   - Updates tg_monitored_chat_ids
 *
 * Accordion 2 (Ветки):
 *   - Tabs = selected groups, paginated (3 per page)
 *   - Search input for threads within the active tab
 *   - Button group: [Все] [Сброс] presets for the active tab
 *   - Checkbox list of forum threads for the active tab
 *   - Updates tg_monitored_thread_ids
 *
 * Removing a group from Accordion 1 automatically purges its thread IDs
 * from tg_monitored_thread_ids (using the local threads cache).
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { getTgChats, getTgThreads } from '@/api/settings'
import type { TgChat, TgThread } from '@/types/settings'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS_PER_PAGE = 3

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCsvToken(v: string): string {
  return v.trim().replace(/^['\"]+|['\"]+$/g, '')
}

function parseCsvIds(value: string): string[] {
  return value.split(',').map(normalizeCsvToken).filter(Boolean)
}

/** Deserialize "chatId:threadId" CSV → Map<chatId, Set<threadId>> */
function deserializeThreadSelection(csv: string): Map<string, Set<string>> {
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

/** Serialize Map<chatId, Set<threadId>> → "chatId:threadId" CSV */
function serializeThreadSelection(map: Map<string, Set<string>>): string {
  const pairs: string[] = []
  for (const [chatId, threadIds] of map) {
    for (const threadId of threadIds) {
      pairs.push(`${chatId}:${threadId}`)
    }
  }
  return pairs.join(',')
}

// ── Checkbox item style helpers ───────────────────────────────────────────────

function itemCls(selected: boolean) {
  return cn(
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors',
    selected
      ? 'bg-indigo-500/20 text-indigo-300'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  )
}

function checkboxCls(selected: boolean) {
  return cn(
    'h-4 w-4 flex-shrink-0 rounded border text-center text-[10px] leading-[14px]',
    selected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-border',
  )
}

// ── AccordionHeader ───────────────────────────────────────────────────────────

function AccordionHeader({
  label,
  badge,
  open,
  onToggle,
}: {
  label: string
  badge: string | null
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-accent/30"
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-foreground">{label}</span>
        {badge !== null && (
          <span className="text-[11px] text-muted-foreground">{badge}</span>
        )}
      </div>
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
          open && 'rotate-180',
        )}
      />
    </button>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Current value of tg_monitored_chat_ids (CSV string) */
  monitoredChatIds: string
  /** Current value of tg_monitored_thread_ids (CSV string) */
  monitoredThreadIds: string
  /** Called when the user changes group selection */
  onChatIdsChange: (value: string) => void
  /** Called when the user changes thread selection */
  onThreadIdsChange: (value: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ThreadSelector({
  monitoredChatIds,
  monitoredThreadIds,
  onChatIdsChange,
  onThreadIdsChange,
}: Props) {
  // ── Chat state ──
  const [allChats, setAllChats] = useState<TgChat[]>([])
  const [chatsLoading, setChatsLoading] = useState(false)

  // ── Thread cache: chatId → TgThread[] (undefined = not yet loaded) ──
  const [threadsCache, setThreadsCache] = useState<Map<string, TgThread[]>>(new Map())
  const [threadLoadingFor, setThreadLoadingFor] = useState<string | null>(null)

  // ── Accordion open state ──
  const [groupsOpen, setGroupsOpen] = useState(true)
  const [threadsOpen, setThreadsOpen] = useState(true)

  // ── Tab navigation ──
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [tabPage, setTabPage] = useState(0)

  // ── Search state ──
  const [groupSearch, setGroupSearch] = useState('')
  const [threadSearch, setThreadSearch] = useState('')

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedChatIds = parseCsvIds(monitoredChatIds)
  const selectedChatIdSet = new Set(selectedChatIds)

  // Thread selection: Map<chatId, Set<threadId>> — new "chatId:threadId" format
  const threadSelectionMap = deserializeThreadSelection(monitoredThreadIds)
  const totalSelectedThreads = Array.from(threadSelectionMap.values()).reduce(
    (acc, set) => acc + set.size,
    0,
  )

  // Selected chats as ordered array (preserving CSV order); fallback to raw ID if chat not in list
  const selectedChats: TgChat[] = selectedChatIds.map(
    (id) => allChats.find((c) => normalizeCsvToken(c.id) === id) ?? { id, name: id, type: 'unknown' as const },
  )

  const totalPages = Math.ceil(selectedChats.length / TABS_PER_PAGE)
  const visibleTabs = selectedChats.slice(tabPage * TABS_PER_PAGE, (tabPage + 1) * TABS_PER_PAGE)

  // Effective active tab — corrected if the selected group was removed
  const effectiveTab: string | null =
    activeTab !== null && selectedChatIds.includes(activeTab) ? activeTab : (selectedChatIds[0] ?? null)

  // Thread IDs selected for the currently active tab
  const selectedThreadIdsForTab: ReadonlySet<string> =
    effectiveTab !== null ? (threadSelectionMap.get(effectiveTab) ?? new Set<string>()) : new Set<string>()

  // Threads for the active tab (null = not yet loaded)
  const activeThreads: TgThread[] | null =
    effectiveTab !== null ? (threadsCache.get(effectiveTab) ?? null) : null

  // Threads filtered by search
  const filteredThreads: TgThread[] =
    activeThreads !== null
      ? activeThreads.filter((t) => {
          const q = threadSearch.trim().toLowerCase()
          return !q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
        })
      : []

  // Group list filtered by search
  const q = groupSearch.trim().toLowerCase()
  const filteredChats = q
    ? allChats.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    : allChats

  // ── Load all chats on mount ───────────────────────────────────────────────

  const loadChats = useCallback(async () => {
    setChatsLoading(true)
    try {
      const list = await getTgChats()
      setAllChats(list)
    } catch {
      // keep empty — Telegram might not be connected yet
    } finally {
      setChatsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadChats()
  }, [loadChats])

  // ── Load threads for a chat ───────────────────────────────────────────────

  const loadThreadsForChat = useCallback(async (chatId: string) => {
    setThreadLoadingFor(chatId)
    try {
      const list = await getTgThreads(chatId)
      setThreadsCache((prev) => new Map(prev).set(chatId, list))
    } catch {
      setThreadsCache((prev) => new Map(prev).set(chatId, []))
    } finally {
      setThreadLoadingFor(null)
    }
  }, [])

  // Auto-load threads when active tab changes and is not yet cached
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (effectiveTab !== null && !threadsCache.has(effectiveTab) && threadLoadingFor !== effectiveTab) {
      void loadThreadsForChat(effectiveTab)
    }
  }, [effectiveTab, threadsCache]) // intentionally narrow deps to avoid re-entry loop

  // Sync activeTab / tabPage when selected chats change
  useEffect(() => {
    if (selectedChatIds.length === 0) {
      setActiveTab(null)
      setTabPage(0)
      return
    }
    if (activeTab === null || !selectedChatIds.includes(activeTab)) {
      setActiveTab(selectedChatIds[0] ?? null)
      setTabPage(0)
      return
    }
    // Clamp page if it's now out of bounds
    const newTotal = Math.ceil(selectedChatIds.length / TABS_PER_PAGE)
    setTabPage((p) => Math.min(p, Math.max(0, newTotal - 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoredChatIds]) // depend on the string — selectedChatIds would create a new array every render

  // Clear thread search when switching tabs
  useEffect(() => {
    setThreadSearch('')
  }, [effectiveTab])

  // ── Group handlers ────────────────────────────────────────────────────────

  const toggleGroup = (chatId: string) => {
    const id = normalizeCsvToken(chatId)
    if (selectedChatIdSet.has(id)) {
      // Deselecting: also purge this chat's threads from the selection map
      onChatIdsChange(selectedChatIds.filter((x) => x !== id).join(','))
      if (threadSelectionMap.has(id)) {
        const newMap = new Map(threadSelectionMap)
        newMap.delete(id)
        onThreadIdsChange(serializeThreadSelection(newMap))
      }
    } else {
      onChatIdsChange([...selectedChatIds, id].join(','))
    }
  }

  // ── Thread handlers ───────────────────────────────────────────────────────

  const toggleThread = (threadId: string) => {
    if (!effectiveTab) return
    const newMap = new Map(threadSelectionMap)
    const chatSet = new Set(newMap.get(effectiveTab) ?? [])
    if (chatSet.has(threadId)) {
      chatSet.delete(threadId)
    } else {
      chatSet.add(threadId)
    }
    if (chatSet.size === 0) {
      newMap.delete(effectiveTab)
    } else {
      newMap.set(effectiveTab, chatSet)
    }
    onThreadIdsChange(serializeThreadSelection(newMap))
  }

  /** Select all visible (filtered) threads in the active tab */
  const selectAllThreads = () => {
    if (!effectiveTab || !activeThreads) return
    const newMap = new Map(threadSelectionMap)
    const existing = newMap.get(effectiveTab) ?? new Set<string>()
    newMap.set(effectiveTab, new Set([...existing, ...filteredThreads.map((t) => t.id)]))
    onThreadIdsChange(serializeThreadSelection(newMap))
  }

  /** Clear all threads for the active tab (ignores search filter) */
  const clearThreads = () => {
    if (!effectiveTab) return
    const newMap = new Map(threadSelectionMap)
    newMap.delete(effectiveTab)
    onThreadIdsChange(serializeThreadSelection(newMap))
  }

  /** Force-reload threads for the active tab */
  const reloadThreads = () => {
    if (effectiveTab === null) return
    setThreadsCache((prev) => {
      const next = new Map(prev)
      next.delete(effectiveTab)
      return next
    })
    // The effect will pick up the missing cache entry and re-fetch
  }

  /** Count selected threads that belong to a given chat */
  const getSelCount = (chatId: string): number => threadSelectionMap.get(chatId)?.size ?? 0

  // ── Group accordion badge ─────────────────────────────────────────────────

  const groupBadge =
    selectedChatIds.length === 0 ? 'все чаты' : `${selectedChatIds.length} выбрано`

  const threadBadge =
    totalSelectedThreads === 0 ? 'все ветки' : `${totalSelectedThreads} выбрано`

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">

      {/* ── Accordion 1: Group selection ──────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-border/40 bg-card/40">
        <AccordionHeader
          label="Группы"
          badge={groupBadge}
          open={groupsOpen}
          onToggle={() => setGroupsOpen((v) => !v)}
        />

        {groupsOpen && (
          <div className="border-t border-border/30 px-3 pb-3 pt-2">
            {/* Search + refresh */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Поиск групп..."
                className="min-w-0 flex-1 rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] outline-none focus:border-indigo-500"
              />
              <button
                onClick={loadChats}
                disabled={chatsLoading}
                title="Обновить список групп"
                className="flex-shrink-0 rounded-md border border-border/40 p-1.5 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
              >
                {chatsLoading
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" />}
              </button>
            </div>

            {/* States */}
            {chatsLoading && allChats.length === 0 && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!chatsLoading && allChats.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Telegram не подключён или групп нет
              </p>
            )}
            {allChats.length > 0 && filteredChats.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Ничего не найдено</p>
            )}

            {/* Chat list */}
            {filteredChats.length > 0 && (
              <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
                {filteredChats.map((chat) => {
                  const isSelected = selectedChatIdSet.has(normalizeCsvToken(chat.id))
                  return (
                    <button
                      key={chat.id}
                      onClick={() => toggleGroup(chat.id)}
                      className={itemCls(isSelected)}
                    >
                      <span className={checkboxCls(isSelected)}>{isSelected ? '✓' : ''}</span>
                      <span className="min-w-0 flex-1 truncate">{chat.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Accordion 2: Thread selection ─────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-border/40 bg-card/40">
        <AccordionHeader
          label="Ветки"
          badge={threadBadge}
          open={threadsOpen}
          onToggle={() => setThreadsOpen((v) => !v)}
        />

        {threadsOpen && (
          <div className="border-t border-border/30">
            {/* Empty state: no groups selected */}
            {selectedChatIds.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-foreground">
                Сначала выберите группы выше
              </p>
            ) : (
              <>
                {/* ── Tab bar ──────────────────────────────────────────── */}
                <div className="flex items-center gap-1 border-b border-border/20 px-2 py-1.5">
                  {/* Prev page */}
                  {totalPages > 1 && (
                    <button
                      onClick={() => setTabPage((p) => Math.max(0, p - 1))}
                      disabled={tabPage === 0}
                      className="flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Tab buttons */}
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                    {visibleTabs.map((chat) => {
                      const selCount = getSelCount(chat.id)
                      const isActive = effectiveTab === chat.id
                      return (
                        <button
                          key={chat.id}
                          onClick={() => setActiveTab(chat.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                            isActive
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                        >
                          <span className="min-w-0 truncate">{chat.name}</span>
                          {selCount > 0 && (
                            <span className="flex-shrink-0 rounded-full bg-indigo-500/30 px-1.5 text-[9px] font-semibold text-indigo-400">
                              ✓{selCount}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {/* Next page */}
                  {totalPages > 1 && (
                    <button
                      onClick={() => setTabPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={tabPage === totalPages - 1}
                      className="flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Page indicator */}
                  {totalPages > 1 && (
                    <span className="flex-shrink-0 text-[10px] text-muted-foreground/50">
                      {tabPage + 1}/{totalPages}
                    </span>
                  )}

                  {/* Reload threads for current tab */}
                  <button
                    onClick={reloadThreads}
                    disabled={threadLoadingFor === effectiveTab}
                    title="Перезагрузить ветки"
                    className="ml-1 flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    {threadLoadingFor === effectiveTab
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                  </button>
                </div>

                {/* ── Thread content ────────────────────────────────────── */}
                <div className="flex flex-col gap-1.5 px-3 py-2">
                  {/* Search + Button group */}
                  <div className="flex items-center gap-1.5">
                    <input
                      value={threadSearch}
                      onChange={(e) => setThreadSearch(e.target.value)}
                      placeholder="Поиск веток..."
                      className="min-w-0 flex-1 rounded-md border border-border/50 bg-background px-2 py-1 text-[12px] outline-none focus:border-indigo-500"
                    />

                    {/* Preset button group */}
                    <div className="flex flex-shrink-0 overflow-hidden rounded-md border border-border/50">
                      <button
                        onClick={selectAllThreads}
                        disabled={!activeThreads || activeThreads.length === 0}
                        title={threadSearch ? 'Выбрать найденные' : 'Выбрать все ветки'}
                        className="border-r border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-indigo-500/10 hover:text-indigo-400 disabled:opacity-40"
                      >
                        Все
                      </button>
                      <button
                        onClick={clearThreads}
                        disabled={!activeThreads || activeThreads.length === 0}
                        title="Сбросить выбор веток"
                        className="px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      >
                        Сброс
                      </button>
                    </div>
                  </div>

                  {/* Thread list / states */}
                  {activeThreads === null ? (
                    // Loading (not yet in cache, effect will fire)
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : activeThreads.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Нет тем — группа не является форумом или тем недоступны.
                      Оставьте пустым — слушать все ветки.
                    </p>
                  ) : filteredThreads.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Ничего не найдено</p>
                  ) : (
                    <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
                      {filteredThreads.map((thread) => {
                        const isSelected = selectedThreadIdsForTab.has(thread.id)
                        return (
                          <button
                            key={thread.id}
                            onClick={() => toggleThread(thread.id)}
                            className={itemCls(isSelected)}
                          >
                            <span className={checkboxCls(isSelected)}>{isSelected ? '✓' : ''}</span>
                            <span className="min-w-0 flex-1 truncate">{thread.name}</span>
                            <span className="text-[10px] text-muted-foreground/50">#{thread.id}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
