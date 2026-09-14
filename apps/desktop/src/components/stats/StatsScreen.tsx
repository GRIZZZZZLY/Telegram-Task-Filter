/**
 * StatsScreen — full-screen statistics overlay.
 *
 * Opened via the chart button in TopBar.
 * Mirrors the SettingsScreen overlay pattern (absolute inset-0, z-20).
 *
 * Sections:
 *  1. Period selector  — Сегодня | Неделя | Всё время | Период...
 *  2. Summary cards    — total / done / inbox / avg completion
 *  3. By day chart     — vertical bars (created vs done)
 *  4. By chat          — horizontal bar chart
 *  5. By thread        — horizontal bar chart
 *  6. By sender        — horizontal bar chart
 *  7. By priority      — coloured horizontal bars
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Loader2, BarChart2 } from 'lucide-react'
import { getStats } from '@/api/stats'
import type { StatsResponse, StatsPeriodKey, DayStat } from '@/api/stats'
import { useChatNames } from '@/hooks/useChatNames'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

// ── Period config ─────────────────────────────────────────────────────────────

const PERIODS: { key: StatsPeriodKey; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week',  label: 'Неделя'  },
  { key: 'all',   label: 'Всё время' },
  { key: 'custom', label: 'Период...' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMinutes(min: number | null): string {
  if (min === null) return '—'
  if (min < 60) return `${Math.round(min)} мин`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

function shortChatId(chatId: string): string {
  const n = parseInt(chatId, 10)
  if (!isNaN(n) && n < 0) return `…${String(Math.abs(n)).slice(-4)}`
  return chatId.slice(-6)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-card/60 px-3 py-2.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <span className={cn('text-xl font-bold leading-none', accent ?? 'text-foreground')}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground/60">{sub}</span>}
    </div>
  )
}

function HBar({
  label, count, max, color = 'bg-indigo-500',
}: {
  label: string
  count: number
  max: number
  color?: string
}) {
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="flex-1 overflow-hidden rounded-full bg-muted/30" style={{ height: 6 }}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-[11px] font-medium text-foreground">
        {count}
      </span>
    </div>
  )
}

function Section({ title, children, empty }: {
  title: string
  children: React.ReactNode
  empty?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {title}
      </p>
      {empty
        ? <p className="text-[11px] text-muted-foreground/40">Нет данных</p>
        : children}
    </div>
  )
}

// ── Day chart ─────────────────────────────────────────────────────────────────

function DayChart({ days }: { days: DayStat[] }) {
  if (days.length === 0) {
    return <p className="text-[11px] text-muted-foreground/40">Нет данных</p>
  }

  const maxVal = Math.max(...days.map((d) => Math.max(d.created, d.done)), 1)
  // Show at most 14 days to fit the compact window
  const visible = days.slice(-14)

  return (
    <div className="flex flex-col gap-1">
      {/* Bars */}
      <div className="flex items-end gap-0.5" style={{ height: 48 }}>
        {visible.map((d) => (
          <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end gap-0.5">
            {/* Created bar */}
            <div
              className="w-full rounded-t bg-indigo-500/50 transition-all"
              style={{ height: `${(d.created / maxVal) * 100}%`, minHeight: d.created > 0 ? 2 : 0 }}
            />
            {/* Done bar (overlay, slightly narrower) */}
            {d.done > 0 && (
              <div
                className="absolute bottom-0 w-1/2 rounded-t bg-emerald-500/70"
                style={{ height: `${(d.done / maxVal) * 100}%`, minHeight: 2 }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Date labels — show first, middle, last */}
      <div className="flex justify-between text-[9px] text-muted-foreground/40">
        <span>{visible[0]?.date.slice(5)}</span>
        {visible.length > 2 && (
          <span>{visible[Math.floor(visible.length / 2)]?.date.slice(5)}</span>
        )}
        <span>{visible[visible.length - 1]?.date.slice(5)}</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-indigo-500/50" />
          Создано
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500/70" />
          Выполнено
        </span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
      const res = await getStats({
        period,
        from_date: period === 'custom' ? fromDate : undefined,
        to_date:   period === 'custom' ? toDate   : undefined,
      })
      setData(res)
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

  // ── Derived display helpers ───────────────────────────────────────────────

  function chatLabel(chatId: string): string {
    return chatNames.get(chatId) ?? `чат ${shortChatId(chatId)}`
  }

  const maxChat   = Math.max(...(data?.by_chat   ?? []).map((c) => c.count), 1)
  const maxThread = Math.max(...(data?.by_thread ?? []).map((t) => t.count), 1)
  const maxSender = Math.max(...(data?.by_sender ?? []).map((s) => s.count), 1)
  const maxPrio   = Math.max(
    ...(data ? Object.values(data.by_priority) : []),
    1,
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-tg-bg">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="relative flex h-11 flex-shrink-0 items-center gap-2 border-b border-tg-divider bg-tg-bg pl-3 pr-2">
        <div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        <BarChart2 className="h-4 w-4 text-muted-foreground/60" />
        <span className="text-sm font-semibold">Статистика</span>

        <div
          className="ml-auto"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={load}
            disabled={loading}
            title="Обновить"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Period selector ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/30 px-3 py-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors',
              period === p.key
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/30 px-3 py-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-indigo-500"
          />
          <span className="text-[11px] text-muted-foreground">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-indigo-500"
          />
          <button
            onClick={load}
            disabled={!fromDate || !toDate || loading}
            className="rounded-lg bg-indigo-500/20 px-3 py-1 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/30 disabled:opacity-40"
          >
            Показать
          </button>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">Ошибка загрузки статистики</p>
          <p className="text-[11px] text-muted-foreground/60">{error}</p>
          <button
            onClick={load}
            className="mt-1 flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Повторить
          </button>
        </div>
      ) : loading && !data ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? null : (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            <SummaryCard
              label="Всего задач"
              value={data.summary.total}
            />
            <SummaryCard
              label="Выполнено"
              value={data.summary.done}
              accent="text-emerald-400"
            />
            <SummaryCard
              label="В работе"
              value={data.summary.inbox}
              accent="text-indigo-400"
            />
            <SummaryCard
              label="Среднее время"
              value={formatMinutes(data.summary.avg_completion_minutes)}
              sub="от создания до выполнения"
            />
          </div>

          {/* ── By day ────────────────────────────────────────────────────── */}
          <Section title="По дням">
            <DayChart days={data.by_day} />
          </Section>

          {/* ── By priority ───────────────────────────────────────────────── */}
          <Section title="По приоритету">
            <div className="flex flex-col gap-1.5">
              {([
                { key: 'high',   label: 'HIGH',   color: 'bg-red-500'      },
                { key: 'medium', label: 'MED',    color: 'bg-amber-500'    },
                { key: 'normal', label: 'NORM',   color: 'bg-slate-500'    },
                { key: 'low',    label: 'LOW',    color: 'bg-emerald-500'  },
              ] as const).map(({ key, label, color }) => (
                <HBar
                  key={key}
                  label={label}
                  count={data.by_priority[key]}
                  max={maxPrio}
                  color={color}
                />
              ))}
            </div>
          </Section>

          {/* ── By chat ───────────────────────────────────────────────────── */}
          <Section title="По чатам" empty={data.by_chat.length === 0}>
            <div className="flex flex-col gap-1.5">
              {data.by_chat.map((c) => (
                <HBar
                  key={c.chat_id}
                  label={chatLabel(c.chat_id)}
                  count={c.count}
                  max={maxChat}
                />
              ))}
            </div>
          </Section>

          {/* ── By thread ─────────────────────────────────────────────────── */}
          <Section title="По веткам" empty={data.by_thread.length === 0}>
            <div className="flex flex-col gap-1.5">
              {data.by_thread.map((t) => (
                <HBar
                  key={`${t.chat_id}:${t.thread_id}`}
                  label={`${chatLabel(t.chat_id)} › #${t.thread_id}`}
                  count={t.count}
                  max={maxThread}
                  color="bg-violet-500"
                />
              ))}
            </div>
          </Section>

          {/* ── By sender ─────────────────────────────────────────────────── */}
          <Section title="По отправителям" empty={data.by_sender.length === 0}>
            <div className="flex flex-col gap-1.5">
              {data.by_sender.map((s) => (
                <HBar
                  key={s.sender_id}
                  label={s.sender_username ?? `id:${s.sender_id}`}
                  count={s.count}
                  max={maxSender}
                  color="bg-cyan-500"
                />
              ))}
            </div>
          </Section>

        </div>
      )}
    </div>
  )
}
