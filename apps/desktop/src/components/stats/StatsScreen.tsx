/**
 * StatsScreen — статистика задач.
 *
 * Периоды, четыре карточки сводки, график по дням и горизонтальные полосы
 * по приоритету, чатам, веткам и отправителям.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react'
import { getStats } from '@/api/stats'
import type { StatsResponse, StatsPeriodKey, DayStat } from '@/api/stats'
import { useChatNames } from '@/hooks/useChatNames'
import { cn } from '@/lib/utils'
import { formatMinutes, shortChatId } from '@/lib/stats-format'
import { PRIORITY_LABEL } from '@/lib/task-format'
import { TgIconButton, TgButton, TgSegmented, TgSection } from '@/components/tg'

interface Props {
  onClose: () => void
}

const PERIODS: { id: StatsPeriodKey; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'all', label: 'Всё время' },
  { id: 'custom', label: 'Период...' },
]

/** One number with its caption, as Telegram shows profile counters. */
function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-tg-btn bg-tg-bg-over px-3 py-2.5">
      <span className="text-tg-sm text-tg-text-sub">{label}</span>
      <span className={cn('text-xl font-semibold leading-none', accent ?? 'text-tg-text-bold')}>
        {value}
      </span>
      {sub && <span className="text-tg-sm text-tg-text-sub">{sub}</span>}
    </div>
  )
}

function HBar({
  label,
  count,
  max,
  color = 'bg-tg-accent',
}: {
  label: string
  count: number
  max: number
  color?: string
}) {
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-[3] truncate text-tg-sm text-tg-text-sub" title={label}>
        {label}
      </span>
      <div className="h-1.5 flex-[2] overflow-hidden rounded-full bg-tg-bg-over">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right text-tg-sm tabular-nums text-tg-text">{count}</span>
    </div>
  )
}

function DayChart({ days }: { days: DayStat[] }) {
  if (days.length === 0) {
    return <p className="text-tg-sm text-tg-text-sub">Нет данных</p>
  }

  const maxVal = Math.max(...days.map((d) => Math.max(d.created, d.done)), 1)
  // Show at most 14 days to fit the compact window
  const visible = days.slice(-14)

  return (
    <div className="flex flex-col gap-1">
      {/* Each column is a full-height flex box: without it the percentage
          heights below resolve against nothing and the bars collapse. */}
      <div className="flex items-end gap-1" style={{ height: 96 }}>
        {visible.map((d) => (
          <div key={d.date} className="flex h-full flex-1 items-end justify-center gap-px" title={`${d.date}: создано ${d.created}, выполнено ${d.done}`}>
            <span
              className="w-1/2 rounded-t-sm bg-tg-accent/60"
              style={{ height: `${(d.created / maxVal) * 100}%`, minHeight: d.created > 0 ? 2 : 0 }}
            />
            <span
              className="w-1/2 rounded-t-sm bg-tg-good"
              style={{ height: `${(d.done / maxVal) * 100}%`, minHeight: d.done > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between text-tg-sm text-tg-text-sub">
        <span>{visible[0]?.date.slice(5)}</span>
        {visible.length > 2 && <span>{visible[Math.floor(visible.length / 2)]?.date.slice(5)}</span>}
        <span>{visible[visible.length - 1]?.date.slice(5)}</span>
      </div>

      <div className="flex items-center gap-3 text-tg-sm text-tg-text-sub">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-tg-sm bg-tg-accent/60" />
          Создано
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-tg-sm bg-tg-good" />
          Выполнено
        </span>
        <span className="ml-auto tabular-nums">максимум за день: {maxVal}</span>
      </div>
    </div>
  )
}

export function StatsScreen({ onClose }: Props) {
  const [period, setPeriod] = useState<StatsPeriodKey>('week')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [data, setData] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chatNames = useChatNames()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getStats({
        period,
        from_date: period === 'custom' ? fromDate : undefined,
        to_date: period === 'custom' ? toDate : undefined,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [period, fromDate, toDate])

  // Auto-load when period changes (not for custom until dates are set)
  useEffect(() => {
    if (period === 'custom') return
    void load()
  }, [period, load])

  const chatLabel = (chatId: string): string => chatNames.get(chatId) ?? `чат ${shortChatId(chatId)}`

  const maxChat = Math.max(...(data?.by_chat ?? []).map((c) => c.count), 1)
  const maxThread = Math.max(...(data?.by_thread ?? []).map((t) => t.count), 1)
  const maxSender = Math.max(...(data?.by_sender ?? []).map((s) => s.count), 1)
  const maxPrio = Math.max(...(data ? Object.values(data.by_priority) : []), 1)

  return (
    <div className="flex h-full flex-col bg-tg-bg">
      {/* Header */}
      <div className="flex h-11 flex-none items-center gap-2 border-b border-tg-divider px-2 pl-1">
        <TgIconButton label="Назад" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </TgIconButton>
        <span className="text-tg-box font-semibold text-tg-text-bold">Статистика</span>
        <TgIconButton label="Обновить" onClick={load} disabled={loading} className="ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </TgIconButton>
      </div>

      {/* Period */}
      <div className="flex flex-none items-center gap-1 border-b border-tg-divider px-3 py-2">
        <TgSegmented
          options={PERIODS.map((p) => ({ id: p.id, label: p.label }))}
          active={period}
          onChange={(id) => setPeriod(id as StatsPeriodKey)}
        />
      </div>

      {period === 'custom' && (
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-tg-divider px-3 py-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="Дата с"
            className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
          />
          <span className="text-tg-sm text-tg-text-sub">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="Дата по"
            className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
          />
          <TgButton
            onClick={load}
            disabled={!fromDate || !toDate || loading}
            className="h-7 px-2.5 text-tg-sm"
          >
            Показать
          </TgButton>
        </div>
      )}

      {/* Body */}
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-tg-base text-tg-text-sub">Ошибка загрузки статистики</p>
          <p className="text-tg-sm text-tg-text-sub">{error}</p>
          <TgButton variant="light" onClick={load}>
            <RefreshCw className="h-3 w-3" />
            Повторить
          </TgButton>
        </div>
      ) : loading && !data ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-tg-text-sub" />
        </div>
      ) : !data ? null : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <div className="grid grid-cols-2 gap-2 px-3 pt-3">
            <SummaryCard label="Всего задач" value={data.summary.total} />
            <SummaryCard label="Выполнено" value={data.summary.done} accent="text-tg-good" />
            <SummaryCard label="Во входящих" value={data.summary.inbox} accent="text-tg-accent-text" />
            <SummaryCard
              label="Среднее время"
              value={formatMinutes(data.summary.avg_completion_minutes)}
              sub="от создания до выполнения"
            />
          </div>

          <TgSection title="По дням">
            <div className="px-[22px] pb-2">
              <DayChart days={data.by_day} />
            </div>
          </TgSection>

          <TgSection title="По приоритету">
            <div className="flex flex-col gap-1.5 px-[22px] pb-2">
              {([
                { key: 'high', color: 'bg-tg-danger' },
                { key: 'medium', color: 'bg-[rgb(var(--tg-peer-3))]' },
                { key: 'normal', color: 'bg-tg-text-sub' },
                { key: 'low', color: 'bg-[rgb(var(--tg-peer-5))]' },
              ] as const).map(({ key, color }) => (
                <HBar
                  key={key}
                  label={PRIORITY_LABEL[key]}
                  count={data.by_priority[key]}
                  max={maxPrio}
                  color={color}
                />
              ))}
            </div>
          </TgSection>

          <TgSection title="По чатам">
            <div className="flex flex-col gap-1.5 px-[22px] pb-2">
              {data.by_chat.length === 0 ? (
                <p className="text-tg-sm text-tg-text-sub">Нет данных</p>
              ) : (
                data.by_chat.map((c) => (
                  <HBar key={c.chat_id} label={chatLabel(c.chat_id)} count={c.count} max={maxChat} />
                ))
              )}
            </div>
          </TgSection>

          <TgSection title="По веткам">
            <div className="flex flex-col gap-1.5 px-[22px] pb-2">
              {data.by_thread.length === 0 ? (
                <p className="text-tg-sm text-tg-text-sub">Нет данных</p>
              ) : (
                data.by_thread.map((t) => (
                  <HBar
                    key={`${t.chat_id}:${t.thread_id}`}
                    // Thread first: two threads of one chat used to look identical
                    // once the chat name ate the width.
                    label={`тема #${t.thread_id} · ${chatLabel(t.chat_id)}`}
                    count={t.count}
                    max={maxThread}
                    color="bg-[rgb(var(--tg-peer-4))]"
                  />
                ))
              )}
            </div>
          </TgSection>

          <TgSection title="По отправителям">
            <div className="flex flex-col gap-1.5 px-[22px] pb-2">
              {data.by_sender.length === 0 ? (
                <p className="text-tg-sm text-tg-text-sub">Нет данных</p>
              ) : (
                data.by_sender.map((s) => (
                  <HBar
                    key={s.sender_id}
                    label={s.sender_username ?? `без имени · ${s.sender_id}`}
                    count={s.count}
                    max={maxSender}
                    color="bg-[rgb(var(--tg-peer-7))]"
                  />
                ))
              )}
            </div>
          </TgSection>
        </div>
      )}
    </div>
  )
}
