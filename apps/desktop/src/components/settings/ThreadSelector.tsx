/**
 * ThreadSelector — выбор отслеживаемых групп и веток.
 *
 * Две раскрывающиеся секции: «Группы» и «Ветки». Ветки показываются
 * вкладками по выбранным группам, по три на страницу, и грузятся по
 * требованию с кэшем.
 *
 * Снятие галочки с группы убирает и все её ветки.
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { getTgChats, getTgThreads } from '@/api/settings'
import type { TgChat, TgThread } from '@/types/settings'
import { cn } from '@/lib/utils'
import { TgSearchField, TgIconButton } from '@/components/tg'
import {
  normalizeCsvToken,
  parseCsvIds,
  deserializeThreadSelection,
  serializeThreadSelection,
  countSelectedThreads,
  removeChatFromSelection,
  toggleThreadInSelection,
} from '@/lib/thread-selection'

const TABS_PER_PAGE = 3

interface Props {
  /** Current value of tg_monitored_chat_ids (CSV string) */
  monitoredChatIds: string
  /** Current value of tg_monitored_thread_ids (CSV string) */
  monitoredThreadIds: string
  onChatIdsChange: (value: string) => void
  onThreadIdsChange: (value: string) => void
}

/** One line with a tick, as Telegram lists selectable chats. */
function PickRow({
  selected,
  label,
  trailing,
  onToggle,
}: {
  selected: boolean
  label: string
  trailing?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-2 rounded-tg-btn px-2 py-1.5 text-left text-tg-base',
        'transition-colors duration-tg-universal',
        selected ? 'text-tg-text' : 'text-tg-text-sub hover:bg-tg-bg-over',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid h-4 w-4 flex-none place-items-center rounded-tg-sm border text-[10px] leading-none',
          selected
            ? 'border-tg-accent bg-tg-accent text-tg-on-accent'
            : 'border-tg-checkbox-off',
        )}
      >
        {selected ? '✓' : ''}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="flex-none text-tg-sm text-tg-text-sub">{trailing}</span>}
    </button>
  )
}

function AccordionHeader({
  label,
  badge,
  open,
  onToggle,
}: {
  label: string
  badge: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors duration-tg-universal hover:bg-tg-bg-over"
    >
      <span className="flex items-center gap-2">
        <span className="text-tg-base font-semibold text-tg-text-bold">{label}</span>
        <span className="text-tg-sm text-tg-text-sub">{badge}</span>
      </span>
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 text-tg-text-sub transition-transform duration-tg-menu',
          open && 'rotate-180',
        )}
      />
    </button>
  )
}

export function ThreadSelector({
  monitoredChatIds,
  monitoredThreadIds,
  onChatIdsChange,
  onThreadIdsChange,
}: Props) {
  const [allChats, setAllChats] = useState<TgChat[]>([])
  const [chatsLoading, setChatsLoading] = useState(false)
  const [threadsCache, setThreadsCache] = useState<Map<string, TgThread[]>>(new Map())
  const [threadLoadingFor, setThreadLoadingFor] = useState<string | null>(null)
  const [groupsOpen, setGroupsOpen] = useState(true)
  const [threadsOpen, setThreadsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [tabPage, setTabPage] = useState(0)
  const [groupSearch, setGroupSearch] = useState('')
  const [threadSearch, setThreadSearch] = useState('')

  const selectedChatIds = parseCsvIds(monitoredChatIds)
  const selectedChatIdSet = new Set(selectedChatIds)
  const threadSelectionMap = deserializeThreadSelection(monitoredThreadIds)
  const totalSelectedThreads = countSelectedThreads(threadSelectionMap)

  const selectedChats: TgChat[] = selectedChatIds.map(
    (id) => allChats.find((c) => normalizeCsvToken(c.id) === id) ?? { id, name: id, type: 'unknown' as const },
  )

  const totalPages = Math.ceil(selectedChats.length / TABS_PER_PAGE)
  const visibleTabs = selectedChats.slice(tabPage * TABS_PER_PAGE, (tabPage + 1) * TABS_PER_PAGE)

  const effectiveTab: string | null =
    activeTab !== null && selectedChatIds.includes(activeTab) ? activeTab : (selectedChatIds[0] ?? null)

  const selectedThreadIdsForTab: ReadonlySet<string> =
    effectiveTab !== null ? (threadSelectionMap.get(effectiveTab) ?? new Set<string>()) : new Set<string>()

  const activeThreads: TgThread[] | null =
    effectiveTab !== null ? (threadsCache.get(effectiveTab) ?? null) : null

  const filteredThreads: TgThread[] =
    activeThreads !== null
      ? activeThreads.filter((t) => {
          const query = threadSearch.trim().toLowerCase()
          return !query || t.name.toLowerCase().includes(query) || t.id.toLowerCase().includes(query)
        })
      : []

  const q = groupSearch.trim().toLowerCase()
  const filteredChats = q
    ? allChats.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    : allChats

  const loadChats = useCallback(async () => {
    setChatsLoading(true)
    try {
      setAllChats(await getTgChats())
    } catch {
      // keep empty — Telegram might not be connected yet
    } finally {
      setChatsLoading(false)
    }
  }, [])

  useEffect(() => { void loadChats() }, [loadChats])

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (effectiveTab !== null && !threadsCache.has(effectiveTab) && threadLoadingFor !== effectiveTab) {
      void loadThreadsForChat(effectiveTab)
    }
  }, [effectiveTab, threadsCache]) // intentionally narrow deps to avoid re-entry loop

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
    const newTotal = Math.ceil(selectedChatIds.length / TABS_PER_PAGE)
    setTabPage((p) => Math.min(p, Math.max(0, newTotal - 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoredChatIds])

  useEffect(() => { setThreadSearch('') }, [effectiveTab])

  const toggleGroup = (chatId: string) => {
    const id = normalizeCsvToken(chatId)
    if (selectedChatIdSet.has(id)) {
      onChatIdsChange(selectedChatIds.filter((x) => x !== id).join(','))
      if (threadSelectionMap.has(id)) {
        onThreadIdsChange(serializeThreadSelection(removeChatFromSelection(threadSelectionMap, id)))
      }
    } else {
      onChatIdsChange([...selectedChatIds, id].join(','))
    }
  }

  const toggleThread = (threadId: string) => {
    if (!effectiveTab) return
    onThreadIdsChange(
      serializeThreadSelection(toggleThreadInSelection(threadSelectionMap, effectiveTab, threadId)),
    )
  }

  /** Select all visible (filtered) threads in the active tab */
  const selectAllThreads = () => {
    if (!effectiveTab || !activeThreads) return
    const next = new Map(threadSelectionMap)
    const existing = next.get(effectiveTab) ?? new Set<string>()
    next.set(effectiveTab, new Set([...existing, ...filteredThreads.map((t) => t.id)]))
    onThreadIdsChange(serializeThreadSelection(next))
  }

  /** Clear all threads for the active tab (ignores search filter) */
  const clearThreads = () => {
    if (!effectiveTab) return
    onThreadIdsChange(serializeThreadSelection(removeChatFromSelection(threadSelectionMap, effectiveTab)))
  }

  const reloadThreads = () => {
    if (effectiveTab === null) return
    setThreadsCache((prev) => {
      const next = new Map(prev)
      next.delete(effectiveTab)
      return next
    })
  }

  const getSelCount = (chatId: string): number => threadSelectionMap.get(chatId)?.size ?? 0

  const groupBadge = selectedChatIds.length === 0 ? 'все чаты' : `${selectedChatIds.length} выбрано`
  const threadBadge = totalSelectedThreads === 0 ? 'все ветки' : `${totalSelectedThreads} выбрано`

  return (
    <div className="flex flex-col gap-2">
      {/* Groups */}
      <div className="overflow-hidden rounded-tg-box border border-tg-divider">
        <AccordionHeader label="Группы" badge={groupBadge} open={groupsOpen} onToggle={() => setGroupsOpen((v) => !v)} />

        {groupsOpen && (
          <div className="border-t border-tg-divider px-3 pb-3 pt-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <TgSearchField
                value={groupSearch}
                onChange={setGroupSearch}
                placeholder="Поиск групп..."
                className="min-w-0 flex-1"
              />
              <TgIconButton label="Обновить список групп" onClick={loadChats} disabled={chatsLoading}>
                {chatsLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </TgIconButton>
            </div>

            {chatsLoading && allChats.length === 0 && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-tg-text-sub" />
              </div>
            )}
            {!chatsLoading && allChats.length === 0 && (
              <p className="text-tg-sm text-tg-text-sub">Telegram не подключён или групп нет</p>
            )}
            {allChats.length > 0 && filteredChats.length === 0 && (
              <p className="text-tg-sm text-tg-text-sub">Ничего не найдено</p>
            )}

            {filteredChats.length > 0 && (
              <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
                {filteredChats.map((chat) => (
                  <PickRow
                    key={chat.id}
                    selected={selectedChatIdSet.has(normalizeCsvToken(chat.id))}
                    label={chat.name}
                    onToggle={() => toggleGroup(chat.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Threads */}
      <div className="overflow-hidden rounded-tg-box border border-tg-divider">
        <AccordionHeader label="Ветки" badge={threadBadge} open={threadsOpen} onToggle={() => setThreadsOpen((v) => !v)} />

        {threadsOpen && (
          <div className="border-t border-tg-divider">
            {selectedChatIds.length === 0 ? (
              <p className="px-3 py-3 text-tg-sm text-tg-text-sub">Сначала выберите группы выше</p>
            ) : (
              <>
                <div className="flex items-center gap-1 border-b border-tg-divider px-2 py-1.5">
                  {totalPages > 1 && (
                    <button
                      type="button"
                      onClick={() => setTabPage((p) => Math.max(0, p - 1))}
                      disabled={tabPage === 0}
                      aria-label="Предыдущая страница"
                      className="flex-none rounded p-0.5 text-tg-text-sub transition-colors duration-tg-universal hover:text-tg-text disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                    {visibleTabs.map((chat) => {
                      const selCount = getSelCount(chat.id)
                      const isActive = effectiveTab === chat.id
                      return (
                        <button
                          key={chat.id}
                          type="button"
                          onClick={() => setActiveTab(chat.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-tg-btn px-2 py-1 text-tg-sm',
                            'transition-colors duration-tg-universal',
                            isActive
                              ? 'bg-tg-accent/15 text-tg-accent-text'
                              : 'text-tg-text-sub hover:bg-tg-bg-over',
                          )}
                        >
                          <span className="min-w-0 truncate">{chat.name}</span>
                          {selCount > 0 && (
                            <span className="flex-none rounded-full bg-tg-accent/25 px-1.5 text-[10px] font-semibold text-tg-accent-text">
                              ✓{selCount}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {totalPages > 1 && (
                    <button
                      type="button"
                      onClick={() => setTabPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={tabPage === totalPages - 1}
                      aria-label="Следующая страница"
                      className="flex-none rounded p-0.5 text-tg-text-sub transition-colors duration-tg-universal hover:text-tg-text disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {totalPages > 1 && (
                    <span className="flex-none text-tg-sm text-tg-text-sub">
                      {tabPage + 1}/{totalPages}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={reloadThreads}
                    disabled={threadLoadingFor === effectiveTab}
                    title="Перезагрузить ветки"
                    aria-label="Перезагрузить ветки"
                    className="ml-1 flex-none rounded p-0.5 text-tg-text-sub transition-colors duration-tg-universal hover:text-tg-text disabled:opacity-30"
                  >
                    {threadLoadingFor === effectiveTab
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <TgSearchField
                      value={threadSearch}
                      onChange={setThreadSearch}
                      placeholder="Поиск веток..."
                      className="min-w-0 flex-1"
                    />
                    <div className="flex flex-none overflow-hidden rounded-tg-btn border border-tg-divider">
                      <button
                        type="button"
                        onClick={selectAllThreads}
                        disabled={!activeThreads || activeThreads.length === 0}
                        title={threadSearch ? 'Выбрать найденные' : 'Выбрать все ветки'}
                        className="border-r border-tg-divider px-2.5 py-1 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-accent-text disabled:opacity-40"
                      >
                        Все
                      </button>
                      <button
                        type="button"
                        onClick={clearThreads}
                        disabled={!activeThreads || activeThreads.length === 0}
                        title="Сбросить выбор веток"
                        className="px-2.5 py-1 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-danger disabled:opacity-40"
                      >
                        Сброс
                      </button>
                    </div>
                  </div>

                  {activeThreads === null ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-tg-text-sub" />
                    </div>
                  ) : activeThreads.length === 0 ? (
                    <p className="text-tg-sm text-tg-text-sub">
                      Нет тем — группа не является форумом или тем недоступны.
                      Оставьте пустым — слушать все ветки.
                    </p>
                  ) : filteredThreads.length === 0 ? (
                    <p className="text-tg-sm text-tg-text-sub">Ничего не найдено</p>
                  ) : (
                    <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto">
                      {filteredThreads.map((thread) => (
                        <PickRow
                          key={thread.id}
                          selected={selectedThreadIdsForTab.has(thread.id)}
                          label={thread.name}
                          trailing={`#${thread.id}`}
                          onToggle={() => toggleThread(thread.id)}
                        />
                      ))}
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
