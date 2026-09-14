# Telegram Redesign, Stage 4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the last four screens on the Telegram kit — statistics, Telegram login, PIN, update dialog — and delete the duplicate setup wizard.

**Architecture:** Two pieces of pure logic that are currently inlined or duplicated move into `src/lib` with tests: the update-state parser, which exists twice, and the statistics formatters. A shared `TgModal` replaces the two hand-rolled modal shells. The setup wizard goes: the login screen already covers the same flow, and the shell already shows it when Telegram is not connected.

**Tech Stack:** React 18, TypeScript 5.5, Tailwind 3.4, framer-motion 11, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-13-telegram-redesign-design.md`
**Behaviour inventory (the contract this stage must not break):** `docs/superpowers/specs/2026-09-14-stage-4-inventory.md`

## Global Constraints

- Work continues on branch `redesign/telegram`. The app must start after every task.
- Do not modify `src/api/*`, `src/types/*`, `src/lib/date.ts`, `src/lib/text.ts`, `src/lib/sound.ts`, `src/lib/log-parser.ts`, or anything under `services/`. New files in `src/lib/` are allowed. `src/hooks/useSetup.ts` is deleted by this plan and is the only hook touched.
- Every colour comes from a `--tg-*` token via a `tg-` Tailwind class. Never a hex value, never a Tailwind palette class.
- Every duration comes from `TG_MS`.
- Radius: `rounded-tg-btn`, `rounded-tg-box`, `rounded-tg-sm`. Never `rounded-xl`.
- Minimum font size 12px (`text-tg-sm`).
- Every Russian string in the inventory is preserved exactly, including «💡», «✓», «←» and the arrow in «my.telegram.org → Apps».
- Run `npx tsc -b` and `npm test` before every commit. Both must be clean.
- Commit messages: English, imperative, prefixed, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

Created:

| File | Responsibility |
|---|---|
| `apps/desktop/src/lib/update-state.ts` | Parses the updater state object from Electron |
| `apps/desktop/src/lib/update-state.test.ts` | Tests for the above |
| `apps/desktop/src/lib/stats-format.ts` | Duration wording and short chat labels |
| `apps/desktop/src/lib/stats-format.test.ts` | Tests for the above |
| `apps/desktop/src/components/tg/TgModal.tsx` | Modal shell: dimming, panel, header, actions |
| `apps/desktop/src/components/tg/TgOtpInput.tsx` | Five-cell code field, moved out of the wizard |

Modified:

| File | Change |
|---|---|
| `apps/desktop/src/components/stats/StatsScreen.tsx` | Rebuilt on the kit |
| `apps/desktop/src/components/auth/TelegramAuthScreen.tsx` | Rebuilt on the kit, gains the five-cell code field |
| `apps/desktop/src/components/auth/PinScreen.tsx` | Rebuilt on the kit |
| `apps/desktop/src/components/ui/UpdateModal.tsx` | Rebuilt on `TgModal`, shared parser |
| `apps/desktop/src/components/settings/sections/UpdatesSection.tsx` | Uses the shared parser |
| `apps/desktop/src/App.tsx` | Drops the wizard branch and the setup flag |
| `apps/desktop/src/components/tg/index.ts` | New exports |

Deleted:

| File | Why |
|---|---|
| `apps/desktop/src/components/setup/SetupWizard.tsx` | Duplicate of the login screen |
| `apps/desktop/src/components/setup/OtpInput.tsx` | Moves to `tg/TgOtpInput.tsx` |
| `apps/desktop/src/hooks/useSetup.ts` | Only the wizard used it |

---

## Task 1: Shared logic, with tests

**Files:**
- Create: `apps/desktop/src/lib/update-state.ts`
- Test: `apps/desktop/src/lib/update-state.test.ts`
- Create: `apps/desktop/src/lib/stats-format.ts`
- Test: `apps/desktop/src/lib/stats-format.test.ts`

**Interfaces:**
- Produces:
  - `interface UpdateState { status: UpdateStatus; currentVersion: string; availableVersion: string | null; progress: number; message: string | null; checkedAt: string | null }`
  - `type UpdateStatus = 'idle' | 'unsupported' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'`
  - `parseUpdateState(value: unknown): UpdateState | null`
  - `isUpdateDialogVisible(state: UpdateState | null): boolean`
  - `formatMinutes(min: number | null): string`
  - `shortChatId(chatId: string): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/lib/update-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseUpdateState, isUpdateDialogVisible } from './update-state'

describe('parseUpdateState', () => {
  it('reads a complete state', () => {
    const s = parseUpdateState({
      status: 'available',
      currentVersion: '0.1.16',
      availableVersion: '0.2.0',
      progress: 42,
      message: 'ready',
      checkedAt: '2026-09-14T10:00:00Z',
    })
    expect(s).toEqual({
      status: 'available',
      currentVersion: '0.1.16',
      availableVersion: '0.2.0',
      progress: 42,
      message: 'ready',
      checkedAt: '2026-09-14T10:00:00Z',
    })
  })

  it('fills in defaults for missing optional fields', () => {
    const s = parseUpdateState({ status: 'idle', currentVersion: '0.1.16' })
    expect(s?.availableVersion).toBeNull()
    expect(s?.progress).toBe(0)
    expect(s?.message).toBeNull()
    expect(s?.checkedAt).toBeNull()
  })

  it('rejects anything that is not a state object', () => {
    expect(parseUpdateState(null)).toBeNull()
    expect(parseUpdateState('available')).toBeNull()
    expect(parseUpdateState({})).toBeNull()
    expect(parseUpdateState({ status: 'available' })).toBeNull()
    expect(parseUpdateState({ currentVersion: '1.0.0' })).toBeNull()
  })

  it('ignores fields of the wrong type instead of trusting them', () => {
    const s = parseUpdateState({
      status: 'error',
      currentVersion: '1.0.0',
      availableVersion: 42,
      progress: 'lots',
      message: {},
    })
    expect(s?.availableVersion).toBeNull()
    expect(s?.progress).toBe(0)
    expect(s?.message).toBeNull()
  })
})

describe('isUpdateDialogVisible', () => {
  it('shows the dialog only for the four states that need the user', () => {
    const at = (status: string) =>
      isUpdateDialogVisible(parseUpdateState({ status, currentVersion: '1.0.0' }))
    expect(at('available')).toBe(true)
    expect(at('downloading')).toBe(true)
    expect(at('downloaded')).toBe(true)
    expect(at('error')).toBe(true)
    expect(at('idle')).toBe(false)
    expect(at('checking')).toBe(false)
    expect(at('not-available')).toBe(false)
    expect(at('unsupported')).toBe(false)
  })

  it('stays hidden with no state at all', () => {
    expect(isUpdateDialogVisible(null)).toBe(false)
  })
})
```

Create `apps/desktop/src/lib/stats-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatMinutes, shortChatId } from './stats-format'

describe('formatMinutes', () => {
  it('shows a dash when there is nothing to show', () => {
    expect(formatMinutes(null)).toBe('—')
  })

  it('shows minutes under an hour', () => {
    expect(formatMinutes(0)).toBe('0 мин')
    expect(formatMinutes(59)).toBe('59 мин')
    expect(formatMinutes(12.4)).toBe('12 мин')
  })

  it('shows whole hours without minutes', () => {
    expect(formatMinutes(60)).toBe('1 ч')
    expect(formatMinutes(120)).toBe('2 ч')
  })

  it('shows hours and minutes together', () => {
    expect(formatMinutes(90)).toBe('1 ч 30 мин')
    expect(formatMinutes(605)).toBe('10 ч 5 мин')
  })
})

describe('shortChatId', () => {
  it('shortens a supergroup id to its last four digits', () => {
    expect(shortChatId('-1001234567890')).toBe('…7890')
  })

  it('keeps the tail of a non-numeric id', () => {
    expect(shortChatId('@teamchat')).toBe('amchat')
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: FAIL on both new files, "Failed to resolve import".

- [ ] **Step 3: Write both modules**

Create `apps/desktop/src/lib/update-state.ts`:

```ts
/**
 * The updater state that the Electron main process pushes to the page.
 *
 * It arrives over IPC as plain JSON, so every field is checked rather than
 * trusted. This parser had two identical copies — one in the update dialog,
 * one in the settings section.
 */
export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  progress: number
  message: string | null
  checkedAt: string | null
}

export function parseUpdateState(value: unknown): UpdateState | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<UpdateState>
  if (typeof v.status !== 'string' || typeof v.currentVersion !== 'string') return null
  return {
    status: v.status as UpdateStatus,
    currentVersion: v.currentVersion,
    availableVersion: typeof v.availableVersion === 'string' ? v.availableVersion : null,
    progress: typeof v.progress === 'number' ? v.progress : 0,
    message: typeof v.message === 'string' ? v.message : null,
    checkedAt: typeof v.checkedAt === 'string' ? v.checkedAt : null,
  }
}

/** The four states where the dialog has something to ask or report. */
export function isUpdateDialogVisible(state: UpdateState | null): boolean {
  if (!state) return false
  return ['available', 'downloading', 'downloaded', 'error'].includes(state.status)
}
```

Create `apps/desktop/src/lib/stats-format.ts`:

```ts
/** Wording used by the statistics screen. */

/** Average completion time, in words. */
export function formatMinutes(min: number | null): string {
  if (min === null) return '—'
  if (min < 60) return `${Math.round(min)} мин`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

/** Short chat label for charts, where the full id does not fit. */
export function shortChatId(chatId: string): string {
  const n = parseInt(chatId, 10)
  if (!isNaN(n) && n < 0) return `…${String(Math.abs(n)).slice(-4)}`
  return chatId.slice(-6)
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: PASS. 41 + 12 = 53 tests in total.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/lib/update-state.ts apps/desktop/src/lib/update-state.test.ts apps/desktop/src/lib/stats-format.ts apps/desktop/src/lib/stats-format.test.ts
git commit -m "refactor: extract the update state parser and stats wording

The parser existed twice, identically, in the update dialog and in the
settings section added last stage. It reads JSON that crosses an IPC
boundary, so the tests cover what happens when a field arrives with the
wrong type.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Modal shell and code field

**Files:**
- Create: `apps/desktop/src/components/tg/TgModal.tsx`
- Create: `apps/desktop/src/components/tg/TgOtpInput.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `TG_MS`, framer-motion, `TgIconButton`.
- Produces:
  - `<TgModal open onClose title subtitle? closable? footer? children />` — dimming plus a panel; Escape and a click on the dimming close it when `closable`.
  - `<TgOtpInput value onChange disabled? length? />` — five cells by default.

- [ ] **Step 1: Write the modal**

Create `apps/desktop/src/components/tg/TgModal.tsx`:

```tsx
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TG_MS } from '@/lib/tg-motion'
import { TgIconButton } from './TgIconButton'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  /** False while an operation must not be interrupted: no cross, no dismiss. */
  closable?: boolean
  /** Buttons along the bottom edge. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Telegram box: dimmed background, rounded panel, title row, actions at the
 * bottom. Replaces two hand-rolled modal shells.
 */
export function TgModal({
  open,
  onClose,
  title,
  subtitle,
  closable = true,
  footer,
  children,
  className,
}: Props) {
  useEffect(() => {
    if (!open || !closable) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closable, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: TG_MS.fadeWrap / 1000, ease: 'linear' }}
            onClick={closable ? onClose : undefined}
            className="fixed inset-0 z-[90]"
            style={{ background: 'var(--tg-layer)' }}
          />

          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: TG_MS.menuShow / 1000, ease: 'easeOut' }}
            className={cn(
              'fixed inset-x-3 top-12 z-[95] flex max-h-[calc(100%-6rem)] flex-col overflow-hidden',
              'rounded-tg-box bg-tg-box-bg',
              'shadow-[0_1px_3px_var(--tg-shadow),0_12px_32px_var(--tg-shadow)]',
              className,
            )}
          >
            <div className="flex flex-none items-start gap-2 border-b border-tg-divider px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-tg-box font-semibold text-tg-box-title">{title}</p>
                {subtitle && <p className="mt-0.5 text-tg-sm text-tg-text-sub">{subtitle}</p>}
              </div>
              {closable && (
                <TgIconButton label="Закрыть" size={26} onClick={onClose}>
                  <X className="h-3.5 w-3.5" />
                </TgIconButton>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>

            {footer && (
              <div className="flex flex-none items-center justify-end gap-2 border-t border-tg-divider px-4 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
```

- [ ] **Step 2: Move the code field**

Create `apps/desktop/src/components/tg/TgOtpInput.tsx`:

```tsx
import { useRef } from 'react'
import type { KeyboardEvent, ClipboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Telegram login codes are five digits. */
  length?: number
}

/**
 * One cell per digit. Typing moves forward, Backspace on an empty cell steps
 * back and clears, arrows move the caret, a pasted code fills the cells.
 */
export function TgOtpInput({ value, onChange, disabled = false, length = 5 }: Props) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const focus = (i: number) => {
    inputsRef.current[Math.min(Math.max(i, 0), length - 1)]?.focus()
  }

  const update = (i: number, char: string) => {
    const next = digits.slice()
    next[i] = char
    onChange(next.join('').trimEnd())
  }

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        update(i, '')
      } else {
        focus(i - 1)
        update(i - 1, '')
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      focus(i - 1)
    } else if (e.key === 'ArrowRight') {
      focus(i + 1)
    }
  }

  const handleInput = (i: number, raw: string) => {
    const char = raw.replace(/\D/g, '').slice(-1)
    if (!char) return
    update(i, char)
    focus(i + 1)
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    focus(Math.min(pasted.length, length - 1))
  }

  return (
    <div className="flex items-center gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Цифра ${i + 1}`}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-12 w-10 rounded-tg-btn border bg-transparent text-center text-lg font-semibold',
            'outline-none transition-colors duration-tg-menu',
            'disabled:cursor-not-allowed disabled:opacity-50',
            digit ? 'border-tg-accent text-tg-text' : 'border-tg-divider text-tg-text-sub',
            'focus:border-tg-line-active',
          )}
        />
      ))}
    </div>
  )
}
```

The old copy dropped the pasted value twice through `onChange`, the first call with a string built by a `padEnd` expression whose result was immediately discarded. Only the second call had any effect; this version keeps that one.

- [ ] **Step 3: Export both**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgModal } from './TgModal'
export { TgOtpInput } from './TgOtpInput'
```

- [ ] **Step 4: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgModal.tsx apps/desktop/src/components/tg/TgOtpInput.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add the modal shell and the code field

The code field moves out of the wizard that is about to be deleted. Its
paste handler called onChange twice, the first time with a value built by
an expression that was discarded; only the second call ever mattered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Statistics

**Files:**
- Modify: `apps/desktop/src/components/stats/StatsScreen.tsx` (full rewrite)

**Interfaces:**
- Consumes: `formatMinutes`, `shortChatId` from `@/lib/stats-format`; `TgIconButton`, `TgButton`, `TgSegmented`, `TgSection` from `@/components/tg`.
- Produces: `StatsScreen` keeps its prop `onClose`.

- [ ] **Step 1: Rewrite it**

Replace the whole of `apps/desktop/src/components/stats/StatsScreen.tsx`:

```tsx
/**
 * StatsScreen — статистика задач.
 *
 * Периоды, четыре карточки сводки, график по дням и горизонтальные полосы
 * по приоритету, чатам, веткам и отправителям.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Loader2, BarChart2 } from 'lucide-react'
import { getStats } from '@/api/stats'
import type { StatsResponse, StatsPeriodKey, DayStat } from '@/api/stats'
import { useChatNames } from '@/hooks/useChatNames'
import { cn } from '@/lib/utils'
import { formatMinutes, shortChatId } from '@/lib/stats-format'
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
      <span className="w-28 shrink-0 truncate text-tg-sm text-tg-text-sub" title={label}>
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tg-bg-over">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right text-tg-sm tabular-nums text-tg-text">{count}</span>
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
      <div className="flex items-end gap-0.5" style={{ height: 48 }}>
        {visible.map((d) => (
          <div key={d.date} className="relative flex flex-1 flex-col items-center justify-end gap-0.5">
            <div
              className="w-full rounded-t-sm bg-tg-accent/50"
              style={{ height: `${(d.created / maxVal) * 100}%`, minHeight: d.created > 0 ? 2 : 0 }}
            />
            {d.done > 0 && (
              <div
                className="absolute bottom-0 w-1/2 rounded-t-sm bg-tg-good"
                style={{ height: `${(d.done / maxVal) * 100}%`, minHeight: 2 }}
              />
            )}
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
          <span className="inline-block h-2 w-3 rounded-tg-sm bg-tg-accent/50" />
          Создано
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-tg-sm bg-tg-good" />
          Выполнено
        </span>
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
        <BarChart2 className="h-4 w-4 text-tg-text-sub" />
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
            <SummaryCard label="В работе" value={data.summary.inbox} accent="text-tg-accent-text" />
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
                { key: 'high', label: 'HIGH', color: 'bg-tg-danger' },
                { key: 'medium', label: 'MED', color: 'bg-[rgb(var(--tg-peer-3))]' },
                { key: 'normal', label: 'NORM', color: 'bg-tg-text-sub' },
                { key: 'low', label: 'LOW', color: 'bg-tg-good' },
              ] as const).map(({ key, label, color }) => (
                <HBar key={key} label={label} count={data.by_priority[key]} max={maxPrio} color={color} />
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
                    label={`${chatLabel(t.chat_id)} › #${t.thread_id}`}
                    count={t.count}
                    max={maxThread}
                    color="bg-[rgb(var(--tg-peer-5))]"
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
                    label={s.sender_username ?? `id:${s.sender_id}`}
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
```

- [ ] **Step 2: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/stats/StatsScreen.tsx
git commit -m "refactor: rebuild the statistics screen on the kit

Same numbers and charts, Telegram colours. The period switch becomes the
shared segmented control, and the duration wording comes from the tested
module.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Telegram login, and the wizard goes

**Files:**
- Modify: `apps/desktop/src/components/auth/TelegramAuthScreen.tsx` (full rewrite)
- Modify: `apps/desktop/src/App.tsx`
- Delete: `apps/desktop/src/components/setup/SetupWizard.tsx`
- Delete: `apps/desktop/src/components/setup/OtpInput.tsx`
- Delete: `apps/desktop/src/hooks/useSetup.ts`

**Interfaces:**
- Consumes: `TgOtpInput`, `TgButton`, `TgTextField` from `@/components/tg`; `authStart`, `authVerify` from `@/api/auth`; `ApiError` from `@/api/client`.
- Produces: `TelegramAuthScreen` keeps its props `hasCredentials`, `onConnected`.

- [ ] **Step 1: Rewrite the login screen**

Replace the whole of `apps/desktop/src/components/auth/TelegramAuthScreen.tsx`:

```tsx
/**
 * TelegramAuthScreen — вход в Telegram.
 *
 * Три шага: ключи приложения и телефон, код из Telegram (плюс пароль
 * двухфакторной проверки, если он есть), готово.
 *
 * Ключи сохраняются в .env на первом шаге, поэтому переживают перезапуск.
 */
import { useState } from 'react'
import { Loader2, MessageCircle, CheckCircle2, ExternalLink, Lock } from 'lucide-react'
import { authStart, authVerify } from '@/api/auth'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { TgButton, TgTextField, TgOtpInput } from '@/components/tg'

interface Props {
  hasCredentials: boolean
  onConnected: (username: string) => void
}

type Step = 'credentials' | 'code' | 'success'

/** Pulls "detail" out of a JSON error body, falling back to the raw text. */
function errorDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(msg) as { detail?: string }
    return parsed.detail ?? msg
  } catch {
    return msg
  }
}

export function TelegramAuthScreen({ hasCredentials, onConnected }: Props) {
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [needs2fa, setNeeds2fa] = useState(false)
  const [step, setStep] = useState<Step>('credentials')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedAs, setConnectedAs] = useState('')

  const handleSendCode = async () => {
    setError(null)

    // If credentials are already configured, api_id/api_hash can be placeholders;
    // the backend will use the .env values.
    const id = apiId.trim()
    const hash = apiHash.trim()

    if (!hasCredentials && (!id || !hash)) {
      setError('Введите API ID и API Hash от my.telegram.org')
      return
    }
    if (!phone.trim()) {
      setError('Введите номер телефона')
      return
    }

    setLoading(true)
    try {
      await authStart({
        api_id: id ? Number(id) : 0,
        api_hash: hash || '_use_env_',
        phone: phone.trim(),
      })
      setStep('code')
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    setError(null)
    if (!code.trim()) {
      setError('Введите код из Telegram')
      return
    }
    if (needs2fa && !password.trim()) {
      setError('Введите пароль 2FA')
      return
    }

    setLoading(true)
    try {
      const res = await authVerify({
        code: code.trim(),
        password: needs2fa ? password.trim() : undefined,
      })

      if (res.status === 'ok') {
        const name = res.username ? `@${res.username}` : (res.first_name ?? 'Пользователь')
        setConnectedAs(name)
        setStep('success')
        onConnected(name)
      } else {
        setError('Неожиданный ответ сервера')
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // 422 = backend signals 2FA is required — show password field, no error
        setNeeds2fa(true)
        setError(null)
      } else {
        setError(errorDetail(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const subtitle =
    step === 'credentials' ? 'Войдите в аккаунт, чтобы получать задачи из чатов'
      : step === 'code' && !needs2fa ? `Код отправлен в Telegram на ${phone}`
      : step === 'code' ? 'Требуется пароль двухфакторной аутентификации'
      : 'Telegram успешно подключён'

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-5 py-6">
      <div className="mb-5 flex flex-col items-center gap-2">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-tg-accent/15">
          <MessageCircle className="h-6 w-6 text-tg-accent-text" />
        </div>
        <p className="text-tg-box font-semibold text-tg-text-bold">Подключение Telegram</p>
        <p className="text-center text-tg-sm leading-relaxed text-tg-text-sub">{subtitle}</p>
      </div>

      {/* Step indicator */}
      <div className="mb-5 flex items-center gap-2">
        {(['credentials', 'code', 'success'] as Step[]).map((s, i) => {
          const done = step === 'success' || (step === 'code' && i === 0)
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold',
                  'transition-colors duration-tg-universal',
                  step === s
                    ? 'bg-tg-accent text-tg-on-accent'
                    : done
                      ? 'bg-tg-accent/25 text-tg-accent-text'
                      : 'bg-tg-bg-over text-tg-text-sub',
                )}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div
                  className={cn(
                    'h-px w-6 transition-colors duration-tg-universal',
                    done ? 'bg-tg-accent/50' : 'bg-tg-divider',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {step === 'credentials' && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          {!hasCredentials ? (
            <div className="rounded-tg-btn border border-tg-divider p-3">
              <p className="mb-2 text-tg-sm text-tg-text-sub">API-ключи Telegram</p>
              <button
                type="button"
                onClick={() => window.electronAPI?.openExternal('https://my.telegram.org/apps')}
                className="mb-2.5 flex items-center gap-1 text-tg-sm text-tg-accent-text"
              >
                <ExternalLink className="h-3 w-3" />
                Получить на my.telegram.org → Apps
              </button>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-tg-sm text-tg-text-sub">API ID</span>
                  <TgTextField
                    type="number"
                    value={apiId}
                    onChange={setApiId}
                    placeholder="1234567"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-tg-sm text-tg-text-sub">API Hash</span>
                  <TgTextField
                    value={apiHash}
                    onChange={setApiHash}
                    placeholder="a1b2c3d4e5f6..."
                    className="font-mono text-tg-base"
                  />
                </label>
              </div>
            </div>
          ) : (
            <p className="rounded-tg-btn bg-tg-accent/10 px-3 py-2 text-tg-sm text-tg-accent-text">
              ✓ API-ключи уже настроены в .env — вводить повторно не нужно
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-tg-sm text-tg-text-sub">Номер телефона</span>
            <TgTextField
              type="tel"
              value={phone}
              onChange={setPhone}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSendCode() }}
              placeholder="+79001234567"
            />
          </label>

          {error && (
            <p className="rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">{error}</p>
          )}

          <TgButton fullWidth onClick={() => void handleSendCode()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отправить код'}
          </TgButton>
        </div>
      )}

      {step === 'code' && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <div className="flex flex-col items-center gap-2">
            <span className="text-tg-sm text-tg-text-sub">Код из Telegram</span>
            <TgOtpInput value={code} onChange={setCode} disabled={needs2fa} />
          </div>

          {!needs2fa && (
            <p className="text-tg-sm leading-relaxed text-tg-text-sub">
              💡 Если на аккаунте установлён пароль двухфакторной аутентификации (2FA),
              он потребуется после ввода кода.
            </p>
          )}

          {needs2fa && (
            <div className="flex flex-col gap-2 rounded-tg-btn border border-tg-divider p-3">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--tg-peer-3))]" />
                <p className="text-tg-sm leading-relaxed text-tg-text-sub">
                  Аккаунт защищён двухфакторной аутентификацией.
                  Введите пароль 2FA, который вы установили в настройках Telegram.
                </p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-tg-sm text-tg-text-sub">Пароль 2FA</span>
                <TgTextField
                  type="password"
                  value={password}
                  onChange={setPassword}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleVerify() }}
                  placeholder="Пароль двухфакторной аутентификации"
                  autoFocus
                />
              </label>
            </div>
          )}

          {error && (
            <p className="rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">{error}</p>
          )}

          <TgButton fullWidth onClick={() => void handleVerify()} disabled={loading}>
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : needs2fa ? 'Войти' : 'Подтвердить'}
          </TgButton>

          <button
            type="button"
            onClick={() => {
              setStep('credentials')
              setCode('')
              setPassword('')
              setNeeds2fa(false)
              setError(null)
            }}
            className="text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:text-tg-text"
          >
            ← Изменить номер
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-tg-good" />
          <p className="text-tg-box font-semibold text-tg-text-bold">Подключено</p>
          <p className="text-tg-base text-tg-text-sub">{connectedAs}</p>
          <p className="text-center text-tg-sm text-tg-text-sub">Приложение загружается...</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Simplify App.tsx**

Replace the whole of `apps/desktop/src/App.tsx`:

```tsx
import { useTheme } from '@/hooks/useTheme'
import { AppShell } from '@/components/layout/AppShell'
import { PinScreen } from '@/components/auth/PinScreen'
import { usePinGuard } from '@/hooks/usePinGuard'

export default function App() {
  useTheme()

  const { state: pinState, pinSet, unlock, skipSetup, recheckPin } = usePinGuard()

  if (pinState === 'loading') return null

  if (pinState === 'needs-setup') {
    return <PinScreen mode="setup" onUnlocked={unlock} onSkipSetup={skipSetup} />
  }

  if (pinState === 'locked') {
    return <PinScreen mode="unlock" onUnlocked={unlock} />
  }

  // Telegram login is not a separate gate any more: AppShell asks the backend
  // whether Telegram is connected and shows TelegramAuthScreen when it is not.
  return <AppShell pinSet={pinSet} onPinChanged={recheckPin} />
}
```

- [ ] **Step 3: Delete the wizard and its hook**

```bash
cd D:/Telegram-Task-Filter
git rm apps/desktop/src/components/setup/SetupWizard.tsx apps/desktop/src/components/setup/OtpInput.tsx apps/desktop/src/hooks/useSetup.ts
```

- [ ] **Step 4: Confirm nothing references them**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rn "SetupWizard\|useSetup\|setup/OtpInput\|tgff_setup_complete" src
```

Expected: no output.

- [ ] **Step 5: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/auth/TelegramAuthScreen.tsx apps/desktop/src/App.tsx
git commit -m "refactor: rebuild the login screen and delete the setup wizard

The wizard walked the same four fields as the login screen — api id, api
hash, phone, code, 2FA password — behind a second copy of the same
requests and a localStorage flag. Its one advantage, the five-cell code
field, moves into the login screen.

App.tsx loses the flag and the branch: the shell already asks the backend
whether Telegram is connected and shows the login screen when it is not.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: PIN screen

**Files:**
- Modify: `apps/desktop/src/components/auth/PinScreen.tsx` (rewrite of the markup; the logic stays)

**Interfaces:**
- Consumes: `TgWindowFrame`, `TG_MS`, `TG_PX`.
- Produces: `PinScreen` keeps its props `mode`, `onUnlocked`, `onSkipSetup`.

- [ ] **Step 1: Replace the markup**

In `apps/desktop/src/components/auth/PinScreen.tsx`, keep every hook and handler exactly as they are, and replace the returned markup (from `return (` to the end of the component) with:

```tsx
  return (
    <TgWindowFrame className="items-center justify-center">
      <div className="flex flex-col items-center gap-6 px-8">
        {/* Icon */}
        <div className="grid h-16 w-16 place-items-center rounded-full bg-tg-accent/15 text-tg-accent-text">
          {mode === 'setup' ? <ShieldCheck size={32} /> : <Lock size={32} />}
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-lg font-semibold text-tg-text-bold">{title}</h1>
          <p className="mt-1 text-tg-sm text-tg-text-sub">{subtitle}</p>
        </div>

        {/* Dots */}
        <div
          className={cn(
            'flex gap-3',
            shake && 'animate-[tg-shake_300ms_ease-in-out]',
          )}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-3.5 w-3.5 rounded-full border-2 transition-all duration-tg-universal',
                i < pin.length
                  ? 'scale-110 border-tg-accent bg-tg-accent'
                  : 'border-tg-checkbox-off bg-transparent',
              )}
            />
          ))}
        </div>

        {/* Error / lockout */}
        <div className="h-5 text-center">
          {lockSeconds > 0 ? (
            <p className="text-tg-sm text-tg-danger">Заблокировано на {lockSeconds}с</p>
          ) : error ? (
            <p className="text-tg-sm text-tg-danger">{error}</p>
          ) : null}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, i) => {
            if (key === '') return <div key={i} />
            const isDelete = key === 'del'
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleKey(key)}
                disabled={loading || lockSeconds > 0}
                aria-label={isDelete ? 'Стереть' : key}
                className={cn(
                  'grid h-14 w-14 place-items-center rounded-full text-lg font-medium',
                  'transition-colors duration-tg-universal',
                  'hover:bg-tg-bg-over active:bg-tg-bg-ripple',
                  'disabled:cursor-not-allowed disabled:opacity-30',
                  isDelete ? 'text-tg-text-sub' : 'text-tg-text',
                )}
              >
                {isDelete ? <Delete size={20} /> : key}
              </button>
            )
          })}
        </div>

        {/* Skip setup (optional) */}
        {mode === 'setup' && onSkipSetup && (
          <button
            type="button"
            onClick={onSkipSetup}
            className="text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:text-tg-text"
          >
            Пропустить (не рекомендуется)
          </button>
        )}
      </div>
    </TgWindowFrame>
  )
}
```

The local `<style>` block with the `shake` keyframes goes: the animation moves into the stylesheet in the next step, named `tg-shake` so it cannot collide.

- [ ] **Step 2: Move the shake into the stylesheet**

In `apps/desktop/src/index.css`, after the `tg-menu-in` keyframes and before the reduced-motion block, add:

```css
/* Error shake: 300ms, 4px, per basic.style shakeDuration/shakeShift. */
@keyframes tg-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}
```

- [ ] **Step 3: Match the shake timing in the component**

`triggerShake` currently clears the flag after 500 ms while the animation runs for 300. In `PinScreen.tsx`, change:

```ts
    setTimeout(() => setShake(false), 500)
```

to:

```ts
    setTimeout(() => setShake(false), TG_MS.shake)
```

and add `import { TG_MS } from '@/lib/tg-motion'` to the imports.

- [ ] **Step 4: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/auth/PinScreen.tsx apps/desktop/src/index.css
git commit -m "refactor: rebuild the PIN screen on the kit

Keypad keys become round, as Telegram draws them, and the shake is now
Telegram's own: 300ms and 4px instead of 500ms and 8px. The logic — auto
submit, lockout countdown, physical keyboard — is untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Update dialog

**Files:**
- Modify: `apps/desktop/src/components/ui/UpdateModal.tsx` (full rewrite)
- Modify: `apps/desktop/src/components/settings/sections/UpdatesSection.tsx` (use the shared parser)

**Interfaces:**
- Consumes: `TgModal`, `TgButton`; `parseUpdateState`, `isUpdateDialogVisible`, `UpdateState` from `@/lib/update-state`.
- Produces: `UpdateModal` keeps its prop `onDismiss`.

- [ ] **Step 1: Rewrite the dialog**

Replace the whole of `apps/desktop/src/components/ui/UpdateModal.tsx`:

```tsx
/**
 * UpdateModal — окно новой версии.
 *
 * Появляется само, когда сервер обновлений сообщил о новой версии.
 * Показывает описание изменений с GitHub и ведёт загрузку и установку.
 */
import { useEffect, useState } from 'react'
import { Download, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { TgModal, TgButton } from '@/components/tg'
import { parseUpdateState, isUpdateDialogVisible } from '@/lib/update-state'
import type { UpdateState } from '@/lib/update-state'

async function fetchChangelog(version: string): Promise<string | null> {
  try {
    const tag = version.startsWith('v') ? version : `v${version}`
    const res = await fetch(
      `https://api.github.com/repos/GRIZZZZZLY/Telegram-Task-Filter/releases/tags/${tag}`,
      { headers: { Accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) return null
    const data = await res.json() as { body?: string }
    return data.body?.trim() || null
  } catch {
    return null
  }
}

/** Release notes are Markdown-ish: headers, bullets, plain lines. */
function Changelog({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-1" />
        if (trimmed.startsWith('## ')) {
          return (
            <p key={i} className="pt-1 text-tg-base font-semibold text-tg-text-bold">
              {trimmed.replace(/^##\s*/, '')}
            </p>
          )
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <p key={i} className="pl-2 text-tg-base text-tg-text-sub">
              · {trimmed.replace(/^[-•]\s*/, '')}
            </p>
          )
        }
        return <p key={i} className="text-tg-base text-tg-text-sub">{trimmed}</p>
      })}
    </div>
  )
}

interface Props {
  /** Called when user clicks "Пропустить" or closes the modal */
  onDismiss: () => void
}

export function UpdateModal({ onDismiss }: Props) {
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [changelog, setChangelog] = useState<string | null>(null)
  const [changelogLoading, setChangelogLoading] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return

    void window.electronAPI.updatesGetState().then((raw) => {
      const s = parseUpdateState(raw)
      if (s) setUpdateState(s)
    })

    return window.electronAPI.onUpdatesStateChanged((raw) => {
      const s = parseUpdateState(raw)
      if (s) setUpdateState(s)
    })
  }, [])

  useEffect(() => {
    const version = updateState?.availableVersion
    if (!version || changelog !== null) return
    setChangelogLoading(true)
    void fetchChangelog(version).then((text) => {
      setChangelog(text)
      setChangelogLoading(false)
    })
  }, [updateState?.availableVersion, changelog])

  const status = updateState?.status
  const visible = isUpdateDialogVisible(updateState)

  const footer = (
    <>
      {status === 'available' && (
        <>
          <TgButton variant="light" onClick={onDismiss}>Пропустить</TgButton>
          <TgButton onClick={() => void window.electronAPI?.updatesDownload()}>
            <Download className="h-3.5 w-3.5" />
            Обновить
          </TgButton>
        </>
      )}

      {status === 'downloading' && (
        <TgButton disabled>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загрузка...
        </TgButton>
      )}

      {status === 'downloaded' && (
        <>
          <TgButton variant="light" onClick={onDismiss}>Позже</TgButton>
          <TgButton onClick={() => window.electronAPI?.updatesInstall()}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Установить и перезапустить
          </TgButton>
        </>
      )}

      {status === 'error' && (
        <>
          <TgButton variant="light" onClick={onDismiss}>Закрыть</TgButton>
          <TgButton variant="light" onClick={() => void window.electronAPI?.updatesDownload()}>
            <Download className="h-3.5 w-3.5" />
            Повторить
          </TgButton>
        </>
      )}
    </>
  )

  return (
    <TgModal
      open={visible}
      onClose={onDismiss}
      title="Доступно обновление"
      subtitle={
        updateState?.availableVersion
          ? `${updateState.currentVersion} → v${updateState.availableVersion}`
          : undefined
      }
      // Only the "available" state may be dismissed; a running download is not
      // interrupted by a stray Escape.
      closable={status === 'available'}
      footer={footer}
    >
      {changelogLoading ? (
        <div className="flex items-center gap-2 text-tg-base text-tg-text-sub">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загрузка описания...
        </div>
      ) : changelog ? (
        <Changelog text={changelog} />
      ) : (
        <p className="text-tg-base text-tg-text-sub">Описание изменений недоступно.</p>
      )}

      {status === 'downloading' && updateState && (
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-tg-bg-over">
            <div
              className="h-full rounded-full bg-tg-accent transition-all"
              style={{ width: `${updateState.progress}%` }}
            />
          </div>
          <p className="mt-1 text-tg-sm text-tg-text-sub">
            Загрузка... {Math.round(updateState.progress)}%
          </p>
        </div>
      )}

      {status === 'downloaded' && (
        <p className="mt-3 flex items-center gap-2 text-tg-base text-tg-good">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Обновление загружено и готово к установке
        </p>
      )}

      {status === 'error' && (
        <p className="mt-3 flex items-start gap-2 text-tg-base text-tg-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{updateState?.message ?? 'Ошибка при загрузке обновления'}</span>
        </p>
      )}
    </TgModal>
  )
}
```

- [ ] **Step 2: Point the settings section at the shared parser**

In `apps/desktop/src/components/settings/sections/UpdatesSection.tsx`, delete the local `UpdateState` interface and the local `parseUpdateState` function, and add the import:

```ts
import { parseUpdateState } from '@/lib/update-state'
import type { UpdateState } from '@/lib/update-state'
```

- [ ] **Step 3: Check everything and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
npm run build
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/ui/UpdateModal.tsx apps/desktop/src/components/settings/sections/UpdatesSection.tsx
git commit -m "refactor: rebuild the update dialog on the shared modal

Both copies of the state parser are gone; the dialog and the settings
section now read the same tested one. A running download can no longer be
dismissed by Escape or a click outside.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Stage check and cleanup

- [ ] **Step 1: Run every automated check**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
npx tsc -b
npm run build
```

Expected: 53 tests pass, no type errors, build succeeds.

- [ ] **Step 2: Confirm the old palette is gone from these screens**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rnE "indigo|amber|emerald|slate|violet|cyan|bg-card|text-muted-foreground|rounded-xl" src/components/stats src/components/auth src/components/ui/UpdateModal.tsx
```

Expected: no output.

- [ ] **Step 3: Confirm the setup folder is empty**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
ls src/components/setup 2>/dev/null || echo "gone"
```

Expected: the folder no longer exists, or is empty. If empty, remove it.

- [ ] **Step 4: Start the app and walk the inventory**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
env -u ELECTRON_RUN_AS_NODE npm run dev
```

If the port is held: `powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen | Select -Expand OwningProcess -Unique | ForEach { Stop-Process -Id \$_ -Force }"`

Check against `docs/superpowers/specs/2026-09-14-stage-4-inventory.md`. The items most likely to have been lost:

1. PIN screen: four dots, round keys, wrong PIN shakes the dots, lockout counts down.
2. Statistics: four period buttons, «Период...» reveals two date fields and «Показать», all five chart blocks appear, empty ones say «Нет данных».
3. Statistics: the average time reads «N ч M мин», not a bare number.
4. Login screen: with keys configured it shows the green confirmation line, otherwise the two key fields and the link to my.telegram.org.
5. Login screen: the code is five separate cells; typing moves forward, Backspace steps back, pasting a code fills them.
6. Update dialog: appears on a new version, shows release notes, «Пропустить» closes it, a running download cannot be dismissed.

- [ ] **Step 5: Commit any fixes**

If the walk found nothing, the stage is done.

---

## What stays for stage 5

Remove `AnimatedGradientBg` and `ThemeToggler`, delete the shadcn colour aliases from `tailwind.config.ts`, and add the high-contrast switch to the settings screen. The completion check for the whole redesign:

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rnE "indigo|amber|emerald|slate|bg-background|text-muted-foreground" src --include=*.tsx
```

must come back empty.
