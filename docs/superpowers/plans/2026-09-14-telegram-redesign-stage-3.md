# Telegram Redesign, Stage 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the settings screen and the chat picker as Telegram settings: grouped rows with a heavy divider between blocks, Telegram switches, and no cards.

**Architecture:** The 1383-line settings screen splits into a shell plus one file per section, so each file holds one subject and stays readable. The CSV logic that encodes selected chats and threads moves into `src/lib/thread-selection.ts` with tests, because it is the only non-obvious pure logic on the screen and it is currently inlined in a component. Business logic and the settings API stay where they are.

**Tech Stack:** React 18, TypeScript 5.5, Tailwind 3.4, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-13-telegram-redesign-design.md`
**Behaviour inventory (the contract this stage must not break):** `docs/superpowers/specs/2026-09-14-stage-3-inventory.md`

## Global Constraints

- Work continues on branch `redesign/telegram`. The app must start after every task.
- Do not modify `src/hooks/*`, `src/api/*`, `src/types/*`, `src/lib/date.ts`, `src/lib/text.ts`, `src/lib/sound.ts`, `src/lib/log-parser.ts`, or anything under `services/`. New files in `src/lib/` are allowed.
- Every colour comes from a `--tg-*` token via a `tg-` Tailwind class. Never a hex value, never `bg-indigo-500` or any other Tailwind palette class.
- Every duration comes from `TG_MS` in `src/lib/tg-motion.ts`.
- Radius: `rounded-tg-btn` (4px) buttons, `rounded-tg-box` (8px) menus and windows, `rounded-tg-sm` (3px) small plates. Never `rounded-xl`.
- Minimum font size 12px (`text-tg-sm`). Rows use `text-tg-box` (14px) for the label and `text-tg-sm` for the hint, as Telegram settings do.
- Every Russian string in the inventory is preserved exactly, including the ellipsis, the `⚡` and the line breaks inside confirmation dialogs.
- Run `npx tsc -b` and `npm test` before every commit. Both must be clean.
- Commit messages: English, imperative, `feat:` / `fix:` / `refactor:` prefix, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

Created:

| File | Responsibility |
|---|---|
| `apps/desktop/src/lib/thread-selection.ts` | Pure CSV encoding of selected chats and threads |
| `apps/desktop/src/lib/thread-selection.test.ts` | Tests for the above |
| `apps/desktop/src/components/tg/TgSection.tsx` | Settings block: title plus a heavy divider above it |
| `apps/desktop/src/components/tg/TgSettingRow.tsx` | One setting: label, hint, control on the right |
| `apps/desktop/src/components/tg/TgTextField.tsx` | Telegram text field with an underline |
| `apps/desktop/src/components/tg/TgNumberField.tsx` | Small numeric field with min and max |
| `apps/desktop/src/components/tg/TgSegmented.tsx` | Two or three mutually exclusive buttons |
| `apps/desktop/src/components/tg/TgSlider.tsx` | Range slider in Telegram colours |
| `apps/desktop/src/components/settings/sections/TelegramSection.tsx` | Handles, chat picker, restart hint |
| `apps/desktop/src/components/settings/sections/FiltersSection.tsx` | Five filter settings |
| `apps/desktop/src/components/settings/sections/ReactionSection.tsx` | Reaction, reply, delay, custom-reply reaction |
| `apps/desktop/src/components/settings/sections/CleanupSection.tsx` | Auto-delete and the two clear buttons |
| `apps/desktop/src/components/settings/sections/HistorySection.tsx` | Catch-up scan and the guard check |
| `apps/desktop/src/components/settings/sections/SecuritySection.tsx` | PIN set and change, auto-lock |
| `apps/desktop/src/components/settings/sections/AppearanceSection.tsx` | Notifications, sound, display mode |
| `apps/desktop/src/components/settings/sections/UpdatesSection.tsx` | Version, check, download, install |
| `apps/desktop/src/components/settings/sections/DiagnosticsSection.tsx` | Log viewer, both modes |
| `apps/desktop/src/components/settings/TagInput.tsx` | Mention handles as removable chips |

Modified:

| File | Change |
|---|---|
| `apps/desktop/src/components/settings/SettingsScreen.tsx` | Becomes the shell: state, save, header, section assembly |
| `apps/desktop/src/components/settings/ThreadSelector.tsx` | Rebuilt on the kit, CSV logic imported |
| `apps/desktop/src/components/tg/index.ts` | New exports |

---

## Task 1: Chat and thread selection, with tests

**Files:**
- Create: `apps/desktop/src/lib/thread-selection.ts`
- Test: `apps/desktop/src/lib/thread-selection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizeCsvToken(value: string): string`
  - `parseCsvIds(value: string): string[]`
  - `deserializeThreadSelection(csv: string): Map<string, Set<string>>`
  - `serializeThreadSelection(map: Map<string, Set<string>>): string`
  - `countSelectedThreads(map: Map<string, Set<string>>): number`
  - `removeChatFromSelection(map: Map<string, Set<string>>, chatId: string): Map<string, Set<string>>`
  - `toggleThreadInSelection(map: Map<string, Set<string>>, chatId: string, threadId: string): Map<string, Set<string>>`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/lib/thread-selection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeCsvToken,
  parseCsvIds,
  deserializeThreadSelection,
  serializeThreadSelection,
  countSelectedThreads,
  removeChatFromSelection,
  toggleThreadInSelection,
} from './thread-selection'

describe('normalizeCsvToken', () => {
  it('trims spaces and strips surrounding quotes', () => {
    expect(normalizeCsvToken('  "-100123"  ')).toBe('-100123')
    expect(normalizeCsvToken("'-100123'")).toBe('-100123')
  })
})

describe('parseCsvIds', () => {
  it('splits and drops empty entries', () => {
    expect(parseCsvIds('-100123, -100456 ,,')).toEqual(['-100123', '-100456'])
  })

  it('returns an empty list for an empty string', () => {
    expect(parseCsvIds('')).toEqual([])
  })
})

describe('deserializeThreadSelection', () => {
  it('reads chat:thread pairs', () => {
    const map = deserializeThreadSelection('-100123:5,-100123:7,-100456:2')
    expect([...map.keys()].sort()).toEqual(['-100123', '-100456'])
    expect([...map.get('-100123')!].sort()).toEqual(['5', '7'])
  })

  it('splits on the last colon, so a chat id may contain one', () => {
    const map = deserializeThreadSelection('a:b:9')
    expect(map.get('a:b')).toEqual(new Set(['9']))
  })

  it('ignores the old flat format and malformed tokens', () => {
    const map = deserializeThreadSelection('123,:,abc:,:7,')
    expect(map.size).toBe(0)
  })
})

describe('serializeThreadSelection', () => {
  it('round-trips through deserialize', () => {
    const csv = '-100123:5,-100123:7,-100456:2'
    const again = serializeThreadSelection(deserializeThreadSelection(csv))
    expect(deserializeThreadSelection(again)).toEqual(deserializeThreadSelection(csv))
  })

  it('returns an empty string for an empty map', () => {
    expect(serializeThreadSelection(new Map())).toBe('')
  })
})

describe('countSelectedThreads', () => {
  it('counts across all chats', () => {
    expect(countSelectedThreads(deserializeThreadSelection('a:1,a:2,b:3'))).toBe(3)
  })
})

describe('removeChatFromSelection', () => {
  it('drops every thread of that chat and leaves the others', () => {
    const map = deserializeThreadSelection('a:1,a:2,b:3')
    const next = removeChatFromSelection(map, 'a')
    expect(next.has('a')).toBe(false)
    expect(next.get('b')).toEqual(new Set(['3']))
  })

  it('does not mutate the input', () => {
    const map = deserializeThreadSelection('a:1')
    removeChatFromSelection(map, 'a')
    expect(map.has('a')).toBe(true)
  })
})

describe('toggleThreadInSelection', () => {
  it('adds a thread that was not selected', () => {
    const next = toggleThreadInSelection(new Map(), 'a', '1')
    expect(next.get('a')).toEqual(new Set(['1']))
  })

  it('removes a thread that was selected', () => {
    const map = deserializeThreadSelection('a:1,a:2')
    const next = toggleThreadInSelection(map, 'a', '1')
    expect(next.get('a')).toEqual(new Set(['2']))
  })

  it('drops the chat entirely when its last thread is removed', () => {
    const map = deserializeThreadSelection('a:1')
    const next = toggleThreadInSelection(map, 'a', '1')
    expect(next.has('a')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: FAIL, "Failed to resolve import ./thread-selection".

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/lib/thread-selection.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: PASS. 27 + 15 = 42 tests in total.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/lib/thread-selection.ts apps/desktop/src/lib/thread-selection.test.ts
git commit -m "refactor: extract the chat and thread selection format

The screen stores monitored threads as chatId:threadId pairs and splits
them on the last colon so a chat id containing one still parses. That rule
lived inline in a component and had no test; it now has seven.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Settings kit

**Files:**
- Create: `apps/desktop/src/components/tg/TgSection.tsx`
- Create: `apps/desktop/src/components/tg/TgSettingRow.tsx`
- Create: `apps/desktop/src/components/tg/TgTextField.tsx`
- Create: `apps/desktop/src/components/tg/TgNumberField.tsx`
- Create: `apps/desktop/src/components/tg/TgSegmented.tsx`
- Create: `apps/desktop/src/components/tg/TgSlider.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `useRipple`, `cn`.
- Produces:
  - `<TgSection title={string} first?={boolean} children />` — heavy 8px divider above the block unless `first`.
  - `<TgSettingRow label={string} hint?={string} onClick?={() => void} children?={ReactNode} />` — ripples only when `onClick` is given.
  - `<TgTextField value onChange placeholder? type? maxLength? inputMode? onBlur? className? />`
  - `<TgNumberField value onChange min max className? />`
  - `<TgSegmented options={{ id: string; label: string }[]} active={string} onChange={(id: string) => void} />`
  - `<TgSlider value onChange min max step? />`

- [ ] **Step 1: Write the section and the row**

Create `apps/desktop/src/components/tg/TgSection.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  /** First block on the screen: no divider above it. */
  first?: boolean
  children: ReactNode
}

/**
 * A block of Telegram settings: a thick strip, then a coloured title, then
 * the rows. Telegram separates settings groups by a band, not by a card.
 */
export function TgSection({ title, first = false, children }: Props) {
  return (
    <section>
      {!first && (
        <div className="h-2 border-y border-tg-divider bg-tg-bg-over" aria-hidden="true" />
      )}
      <h2 className={cn('px-[22px] pb-1.5 text-tg-base font-semibold text-tg-accent-text', first ? 'pt-3' : 'pt-3.5')}>
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}
```

Create `apps/desktop/src/components/tg/TgSettingRow.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

interface Props {
  label: string
  hint?: string
  /** Makes the whole row pressable, as Telegram does for rows that open something. */
  onClick?: () => void
  /** Control on the right: a switch, a field, a button. */
  children?: ReactNode
  className?: string
}

/** One setting: label and optional hint on the left, control on the right. */
export function TgSettingRow({ label, hint, onClick, children, className }: Props) {
  const ripple = useRipple()

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-tg-box text-tg-text-bold">{label}</span>
        {hint && <span className="mt-0.5 block text-tg-sm text-tg-text-sub">{hint}</span>}
      </span>
      {children && <span className="flex flex-none items-center gap-2">{children}</span>}
    </>
  )

  if (!onClick) {
    return (
      <div className={cn('flex items-center gap-3 px-[22px] pb-2 pt-2.5', className)}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      {...ripple}
      className={cn(
        'relative flex items-center gap-3 overflow-hidden px-[22px] pb-2 pt-2.5 text-left',
        'transition-colors duration-tg-universal hover:bg-tg-bg-over',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        className,
      )}
    >
      {content}
    </button>
  )
}
```

- [ ] **Step 2: Write the fields**

Create `apps/desktop/src/components/tg/TgTextField.tsx`:

```tsx
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (next: string) => void
}

/** Telegram input: no box, a line underneath that turns accent on focus. */
export function TgTextField({ value, onChange, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full border-0 border-b border-tg-divider bg-transparent px-0 py-1',
        'text-tg-box text-tg-text outline-none',
        'transition-colors duration-tg-menu',
        'placeholder:text-tg-placeholder',
        'focus:border-tg-line-active',
        className,
      )}
    />
  )
}
```

Create `apps/desktop/src/components/tg/TgNumberField.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface Props {
  value: number
  onChange: (next: number) => void
  min: number
  max: number
  className?: string
}

/** Small numeric field for settings; clamps to the allowed range. */
export function TgNumberField({ value, onChange, min, max, className }: Props) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const raw = Number(e.target.value)
        if (Number.isNaN(raw)) return
        onChange(Math.max(min, Math.min(max, raw)))
      }}
      className={cn(
        'w-16 rounded-tg-btn border border-tg-divider bg-transparent px-2 py-1',
        'text-center text-tg-base text-tg-text outline-none',
        'transition-colors duration-tg-menu focus:border-tg-line-active',
        className,
      )}
    />
  )
}
```

- [ ] **Step 3: Write the segmented control and the slider**

Create `apps/desktop/src/components/tg/TgSegmented.tsx`:

```tsx
import { cn } from '@/lib/utils'

export interface TgSegmentedOption {
  id: string
  label: string
}

interface Props {
  options: TgSegmentedOption[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** Two or three exclusive choices, as Telegram shows small mode switches. */
export function TgSegmented({ options, active, onChange, className }: Props) {
  return (
    <div className={cn('flex overflow-hidden rounded-tg-btn border border-tg-divider', className)}>
      {options.map((opt, i) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={opt.id === active}
          className={cn(
            'px-2.5 py-1 text-tg-sm transition-colors duration-tg-universal',
            i > 0 && 'border-l border-tg-divider',
            opt.id === active
              ? 'bg-tg-accent text-tg-on-accent'
              : 'text-tg-text-sub hover:bg-tg-bg-over',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

Create `apps/desktop/src/components/tg/TgSlider.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface Props {
  value: number
  onChange: (next: number) => void
  min: number
  max: number
  step?: number
  className?: string
}

/** Range slider using Telegram's accent for the filled part. */
export function TgSlider({ value, onChange, min, max, step = 1, className }: Props) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('h-1.5 w-24 cursor-pointer accent-tg-accent', className)}
    />
  )
}
```

- [ ] **Step 4: Export them**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgSection } from './TgSection'
export { TgSettingRow } from './TgSettingRow'
export { TgTextField } from './TgTextField'
export { TgNumberField } from './TgNumberField'
export { TgSegmented } from './TgSegmented'
export type { TgSegmentedOption } from './TgSegmented'
export { TgSlider } from './TgSlider'
```

- [ ] **Step 5: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgSection.tsx apps/desktop/src/components/tg/TgSettingRow.tsx apps/desktop/src/components/tg/TgTextField.tsx apps/desktop/src/components/tg/TgNumberField.tsx apps/desktop/src/components/tg/TgSegmented.tsx apps/desktop/src/components/tg/TgSlider.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add the settings kit

Telegram separates settings groups with a thick band and an accent title,
not with cards and borders. The row puts the label and its hint on the
left and the control on the right, and only ripples when the whole row is
pressable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Chat and thread picker

**Files:**
- Create: `apps/desktop/src/components/settings/TagInput.tsx`
- Modify: `apps/desktop/src/components/settings/ThreadSelector.tsx` (full rewrite)

**Interfaces:**
- Consumes: Task 1 helpers, `TgSearchField`, `TgIconButton`, `TgSegmented` from `@/components/tg`.
- Produces:
  - `<TagInput value onChange placeholder? />` — comma-separated handles as chips.
  - `ThreadSelector` keeps its props: `monitoredChatIds`, `monitoredThreadIds`, `onChatIdsChange`, `onThreadIdsChange`.

- [ ] **Step 1: Write the tag input**

Create `apps/desktop/src/components/settings/TagInput.tsx`:

```tsx
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

/**
 * Mention handles as chips. Enter or a comma adds one, the @ is added for
 * you, duplicates are ignored, the cross removes.
 */
export function TagInput({ value, onChange, placeholder }: Props) {
  const tags = value.split(',').map((t) => t.trim()).filter(Boolean)
  const [input, setInput] = useState('')

  const addTag = () => {
    const tag = input.trim()
    if (!tag) return
    const formatted = tag.startsWith('@') ? tag : `@${tag}`
    if (!tags.includes(formatted)) onChange([...tags, formatted].join(','))
    setInput('')
  }

  const removeTag = (t: string) => onChange(tags.filter((x) => x !== t).join(','))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-tg-accent/15 px-2 py-0.5 text-tg-sm text-tg-accent-text"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Удалить ${tag}`}
            className="transition-colors duration-tg-universal hover:text-tg-text"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder ?? '@тег'}
          className={cn(
            'w-24 border-0 border-b border-tg-divider bg-transparent px-0 py-0.5',
            'text-tg-base text-tg-text outline-none transition-colors duration-tg-menu',
            'placeholder:text-tg-placeholder focus:border-tg-line-active',
          )}
        />
        <button
          type="button"
          onClick={addTag}
          aria-label="Добавить тег"
          className="grid h-5 w-5 place-items-center rounded-full bg-tg-accent/15 text-tg-accent-text transition-colors duration-tg-universal hover:bg-tg-accent/25"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the picker**

Replace the whole of `apps/desktop/src/components/settings/ThreadSelector.tsx`:

```tsx
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
          const q = threadSearch.trim().toLowerCase()
          return !q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
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
```

- [ ] **Step 3: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/settings/ThreadSelector.tsx apps/desktop/src/components/settings/TagInput.tsx
git commit -m "refactor: rebuild the chat picker on the kit

Same two accordions, same tabs and presets, Telegram colours and the
shared search field. The CSV encoding now comes from the tested module
instead of being inlined here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Sections one to three

Each section is a component that takes the settings object and a patch
function. The shell owns the state; a section only renders and calls back.

**Files:**
- Create: `apps/desktop/src/components/settings/sections/TelegramSection.tsx`
- Create: `apps/desktop/src/components/settings/sections/FiltersSection.tsx`
- Create: `apps/desktop/src/components/settings/sections/ReactionSection.tsx`

**Interfaces:**
- Consumes: `TgSection`, `TgSettingRow`, `TgToggle`, `TgTextField`, `TgNumberField`, `TgSegmented`, `TgSlider` from `@/components/tg`; `TagInput` and `ThreadSelector` from `../`.
- Produces: `interface SectionProps { settings: AppSettings; patch: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void }`, exported from `TelegramSection.tsx` and reused by the other sections.

- [ ] **Step 1: Write the Telegram section**

Create `apps/desktop/src/components/settings/sections/TelegramSection.tsx`:

```tsx
import { TgSection } from '@/components/tg'
import type { AppSettings } from '@/types/settings'
import { TagInput } from '../TagInput'
import { ThreadSelector } from '../ThreadSelector'

export interface SectionProps {
  settings: AppSettings
  patch: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function TelegramSection({ settings, patch }: SectionProps) {
  return (
    <TgSection title="Telegram" first>
      <div className="px-[22px] pb-2 pt-1">
        <p className="text-tg-box text-tg-text-bold">Мой Telegram handle</p>
        <p className="mb-2 mt-0.5 text-tg-sm text-tg-text-sub">
          Задачи создаются только для сообщений, где упомянут ваш @тег
        </p>
        <TagInput
          value={settings.tg_mention_handles}
          onChange={(v) => patch('tg_mention_handles', v)}
          placeholder="@username"
        />
      </div>

      <div className="px-[22px] pb-2 pt-2">
        <p className="mb-2 text-tg-box text-tg-text-bold">Отслеживаемые чаты и ветки</p>
        <ThreadSelector
          monitoredChatIds={settings.tg_monitored_chat_ids}
          monitoredThreadIds={settings.tg_monitored_thread_ids}
          onChatIdsChange={(v) => patch('tg_monitored_chat_ids', v)}
          onThreadIdsChange={(v) => patch('tg_monitored_thread_ids', v)}
        />
      </div>

      <p className="mx-[22px] mb-3 rounded-tg-btn bg-tg-accent/10 px-2.5 py-1.5 text-tg-sm text-tg-accent-text">
        ⚡ После изменения чатов нажмите <strong>Применить</strong> — это перезапустит слушатель.
      </p>
    </TgSection>
  )
}
```

- [ ] **Step 2: Write the filters section**

Create `apps/desktop/src/components/settings/sections/FiltersSection.tsx`:

```tsx
import { TgSection, TgSettingRow, TgToggle, TgNumberField, TgSegmented } from '@/components/tg'
import type { SectionProps } from './TelegramSection'

export function FiltersSection({ settings, patch }: SectionProps) {
  return (
    <TgSection title="Фильтры">
      <TgSettingRow label="Игнорировать свои сообщения">
        <TgToggle
          checked={settings.filter_ignore_own}
          onChange={(v) => patch('filter_ignore_own', v)}
          label="Игнорировать свои сообщения"
        />
      </TgSettingRow>

      <TgSettingRow
        label="Минимальная длина текста"
        hint={`Сейчас: ${settings.filter_min_text_length} симв.`}
      >
        <TgNumberField
          value={settings.filter_min_text_length}
          onChange={(v) => patch('filter_min_text_length', v)}
          min={0}
          max={2000}
        />
      </TgSettingRow>

      <TgSettingRow
        label="Контекст из reply"
        hint="Если сообщение короткий пинг с @тегом, брать суть задачи из родительского сообщения"
      >
        <TgToggle
          checked={settings.tg_context_lift_enabled}
          onChange={(v) => patch('tg_context_lift_enabled', v)}
          label="Контекст из reply"
        />
      </TgSettingRow>

      <TgSettingRow label="Порядок задач в inbox">
        <TgSegmented
          options={[
            { id: 'desc', label: 'Новые сверху' },
            { id: 'asc', label: 'Новые снизу' },
          ]}
          active={settings.tasks_inbox_sort_direction === 'asc' ? 'asc' : 'desc'}
          onChange={(id) => patch('tasks_inbox_sort_direction', id as 'asc' | 'desc')}
        />
      </TgSettingRow>

      <TgSettingRow label="Высокий приоритет выше" hint="Сначала HIGH, потом MED, LOW, NORM">
        <TgToggle
          checked={settings.tasks_inbox_sort_by_priority}
          onChange={(v) => patch('tasks_inbox_sort_by_priority', v)}
          label="Высокий приоритет выше"
        />
      </TgSettingRow>
    </TgSection>
  )
}
```

- [ ] **Step 3: Write the reaction section**

Create `apps/desktop/src/components/settings/sections/ReactionSection.tsx`:

```tsx
import { TgSection, TgSettingRow, TgToggle, TgTextField, TgSlider } from '@/components/tg'
import { cn } from '@/lib/utils'
import type { SectionProps } from './TelegramSection'

/** Reactions Telegram accepts on a message. */
const REACTION_OPTIONS = ['👍', '❤', '🔥', '🎉', '👏', '🤝', '💯', '✍']

function EmojiPick({
  value,
  onPick,
  withDefaultOption = false,
}: {
  value: string
  onPick: (emoji: string) => void
  /** Adds a "same as the main one" choice, used by the custom-reply reaction. */
  withDefaultOption?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {withDefaultOption && (
        <button
          type="button"
          onClick={() => onPick('')}
          className={cn(
            'flex h-8 items-center rounded-tg-btn border px-2 text-tg-sm transition-colors duration-tg-universal',
            value === ''
              ? 'border-tg-accent bg-tg-accent/15 text-tg-accent-text'
              : 'border-tg-divider text-tg-text-sub hover:bg-tg-bg-over',
          )}
        >
          как основная
        </button>
      )}
      {REACTION_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-label={`Реакция ${emoji}`}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-tg-btn border text-lg transition-colors duration-tg-universal',
            value === emoji
              ? 'border-tg-accent bg-tg-accent/15'
              : 'border-tg-divider hover:bg-tg-bg-over',
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

export function ReactionSection({ settings, patch }: SectionProps) {
  return (
    <TgSection title="Реакция на выполнение">
      <TgSettingRow
        label="Отправлять реакцию"
        hint="Ставить эмодзи-реакцию на сообщение при выполнении"
      >
        <TgToggle
          checked={settings.done_reaction_enabled}
          onChange={(v) => patch('done_reaction_enabled', v)}
          label="Отправлять реакцию"
        />
      </TgSettingRow>

      {settings.done_reaction_enabled && (
        <div className="px-[22px] pb-2 pt-1">
          <p className="mb-2 text-tg-sm text-tg-text-sub">Реакция</p>
          <EmojiPick value={settings.done_reaction} onPick={(e) => patch('done_reaction', e)} />
        </div>
      )}

      <TgSettingRow label="Отправлять ответ в чат">
        <TgToggle
          checked={settings.done_send_reply}
          onChange={(v) => patch('done_send_reply', v)}
          label="Отправлять ответ в чат"
        />
      </TgSettingRow>

      {settings.done_send_reply && (
        <div className="px-[22px] pb-2 pt-1">
          <p className="mb-1 text-tg-sm text-tg-text-sub">Текст ответа</p>
          <TgTextField
            value={settings.done_reply_text}
            onChange={(v) => patch('done_reply_text', v)}
          />
        </div>
      )}

      <TgSettingRow
        label="Задержка реакции"
        hint={`${settings.done_commit_delay_seconds} сек — время на отмену`}
      >
        <TgSlider
          value={settings.done_commit_delay_seconds}
          onChange={(v) => patch('done_commit_delay_seconds', v)}
          min={0}
          max={60}
        />
      </TgSettingRow>

      <TgSettingRow
        label="Реакция на кастомный ответ"
        hint="Ставить отдельную реакцию, когда задача выполнена с кастомным текстом"
      >
        <TgToggle
          checked={settings.custom_reply_reaction_enabled}
          onChange={(v) => patch('custom_reply_reaction_enabled', v)}
          label="Реакция на кастомный ответ"
        />
      </TgSettingRow>

      {settings.custom_reply_reaction_enabled && (
        <div className="px-[22px] pb-2 pt-1">
          <p className="mb-2 text-tg-sm text-tg-text-sub">
            Реакция для кастомного ответа <span className="text-tg-placeholder">(пусто = как основная)</span>
          </p>
          <EmojiPick
            value={settings.custom_reply_reaction}
            onPick={(e) => patch('custom_reply_reaction', e)}
            withDefaultOption
          />
        </div>
      )}
    </TgSection>
  )
}
```

- [ ] **Step 4: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/settings/sections/TelegramSection.tsx apps/desktop/src/components/settings/sections/FiltersSection.tsx apps/desktop/src/components/settings/sections/ReactionSection.tsx
git commit -m "feat: add the first three settings sections

Telegram, filters and reactions, one file each. The screen was a single
1383-line component; splitting it by subject is what makes the rest of
this stage reviewable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Sections four to six

**Files:**
- Create: `apps/desktop/src/components/settings/sections/CleanupSection.tsx`
- Create: `apps/desktop/src/components/settings/sections/HistorySection.tsx`
- Create: `apps/desktop/src/components/settings/sections/SecuritySection.tsx`

**Interfaces:**
- Consumes: `SectionProps` from `./TelegramSection`; `clearDoneTasks`, `clearInboxTasks` from `@/api/tasks`; `scanHistory` from `@/api/settings`; `apiFetch` from `@/api/client`; `setPin` from `@/api/pin`; `getLockTimeoutMinutes`, `setLockTimeoutMinutes` from `@/hooks/usePinGuard`; `nativeConfirm` from `@/lib/dialog`.
- Produces: `CleanupSection(props: SectionProps)`, `HistorySection(props: SectionProps)`, `SecuritySection(props: { pinSet?: boolean; onPinChanged?: () => void })`.

- [ ] **Step 1: Write the cleanup section**

Create `apps/desktop/src/components/settings/sections/CleanupSection.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { TgSection, TgSettingRow, TgNumberField, TgButton } from '@/components/tg'
import { clearDoneTasks, clearInboxTasks } from '@/api/tasks'
import { nativeConfirm } from '@/lib/dialog'
import type { SectionProps } from './TelegramSection'

export function CleanupSection({ settings, patch }: SectionProps) {
  const [clearingDone, setClearingDone] = useState(false)
  const [clearingInbox, setClearingInbox] = useState(false)

  const handleClearDone = useCallback(async () => {
    const ok = await nativeConfirm('Удалить все выполненные задачи?')
    if (!ok) return
    setClearingDone(true)
    try {
      const res = await clearDoneTasks()
      alert(`Удалено ${res.deleted} задач`)
    } catch {
      alert('Ошибка очистки')
    } finally {
      setClearingDone(false)
    }
  }, [])

  const handleClearInbox = useCallback(async () => {
    const ok = await nativeConfirm(
      'Очистить ВСЕ задачи во вкладке Inbox?\n\nЭто удалит только локальные задачи в приложении (без действий в Telegram).'
    )
    if (!ok) return
    setClearingInbox(true)
    try {
      const res = await clearInboxTasks()
      alert(`Удалено ${res.deleted} задач из inbox`)
    } catch {
      alert('Ошибка очистки inbox')
    } finally {
      setClearingInbox(false)
    }
  }, [])

  return (
    <TgSection title="Очистка">
      <TgSettingRow
        label="Авто-удаление выполненных"
        hint={settings.cleanup_done_after_days === 0 ? 'Выключено' : `Через ${settings.cleanup_done_after_days} дн.`}
      >
        <TgNumberField
          value={settings.cleanup_done_after_days}
          onChange={(v) => patch('cleanup_done_after_days', v)}
          min={0}
          max={365}
        />
      </TgSettingRow>

      <TgSettingRow label="Удалить все выполненные сейчас">
        <TgButton variant="attention" onClick={handleClearDone} disabled={clearingDone} className="h-7 px-2.5 text-tg-sm">
          {clearingDone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Очистить
        </TgButton>
      </TgSettingRow>

      <TgSettingRow label="Аварийная очистка inbox" hint="Удалит только локальные inbox-задачи">
        <TgButton variant="attention" onClick={handleClearInbox} disabled={clearingInbox} className="h-7 px-2.5 text-tg-sm">
          {clearingInbox ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Очистить inbox
        </TgButton>
      </TgSettingRow>
    </TgSection>
  )
}
```

- [ ] **Step 2: Write the history section**

Create `apps/desktop/src/components/settings/sections/HistorySection.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { Loader2, History, RotateCcw } from 'lucide-react'
import { TgSection, TgSettingRow, TgToggle, TgNumberField, TgButton } from '@/components/tg'
import { scanHistory } from '@/api/settings'
import type { ScanHistoryResult } from '@/api/settings'
import { apiFetch } from '@/api/client'
import { cn } from '@/lib/utils'
import type { SectionProps } from './TelegramSection'

interface GuardCheckResult {
  ok: boolean
  checked: number
  ok_count: number
  rolled_back: number
  skipped: number
}

export function HistorySection({ settings, patch }: SectionProps) {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanHistoryResult | null>(null)
  const [scanHours, setScanHours] = useState(8)
  const [scanError, setScanError] = useState<string | null>(null)
  const [guardChecking, setGuardChecking] = useState(false)
  const [guardResult, setGuardResult] = useState<GuardCheckResult | null>(null)
  const [guardError, setGuardError] = useState<string | null>(null)

  const handleScanHistory = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    try {
      setScanResult(await scanHistory(scanHours))
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }, [scanHours])

  const handleGuardCheck = useCallback(async () => {
    setGuardChecking(true)
    setGuardResult(null)
    setGuardError(null)
    try {
      setGuardResult(await apiFetch<GuardCheckResult>('/telegram/guard-check?hours=72&batch=300', { method: 'POST' }))
    } catch (err) {
      setGuardError(err instanceof Error ? err.message : String(err))
    } finally {
      setGuardChecking(false)
    }
  }, [])

  return (
    <TgSection title="Сканирование истории">
      <TgSettingRow
        label="Авто-скан при запуске"
        hint="Сканировать историю сообщений при каждом запуске приложения"
      >
        <TgToggle
          checked={settings.catchup_enabled}
          onChange={(v) => patch('catchup_enabled', v)}
          label="Авто-скан при запуске"
        />
      </TgSettingRow>

      {settings.catchup_enabled && (
        <TgSettingRow label="Глубина скана" hint={`Последние ${settings.catchup_hours} ч`}>
          <TgNumberField
            value={settings.catchup_hours}
            onChange={(v) => patch('catchup_hours', v)}
            min={1}
            max={168}
          />
        </TgSettingRow>
      )}

      <div className="flex flex-col gap-2 px-[22px] pb-2 pt-2">
        <p className="text-tg-sm text-tg-text-sub">Ручной скан истории</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-tg-sm text-tg-text-sub">За последние</span>
          <TgNumberField value={scanHours} onChange={setScanHours} min={1} max={168} />
          <span className="text-tg-sm text-tg-text-sub">ч</span>
          <TgButton variant="light" onClick={handleScanHistory} disabled={scanning} className="h-7 px-2.5 text-tg-sm">
            {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />}
            Сканировать
          </TgButton>
        </div>

        {scanResult && (
          <div
            className={cn(
              'rounded-tg-btn px-3 py-2 text-tg-sm',
              scanResult.ok ? 'bg-tg-good/10 text-tg-good' : 'bg-tg-danger/10 text-tg-danger',
            )}
          >
            {scanResult.ok
              ? `Просмотрено: ${scanResult.scanned} · Создано: ${scanResult.created} · Уже выполнено: ${scanResult.skipped_done} · Дубли: ${scanResult.skipped_dup}`
              : 'Ошибка сканирования'}
          </div>
        )}
        {scanError && (
          <div className="rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">
            Ошибка: {scanError}
          </div>
        )}
      </div>

      <div className="mx-[22px] mb-3 rounded-tg-btn border border-tg-divider p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-tg-sm text-tg-text-sub">Проверка guard</p>
          <TgButton variant="light" onClick={handleGuardCheck} disabled={guardChecking} className="h-7 px-2.5 text-tg-sm">
            {guardChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Guard
          </TgButton>
        </div>

        <p className="text-tg-sm text-tg-text-sub">
          Что делает: проверяет, что реакции/ответы стоят только на сообщениях с твоим тегом; неверные реакции снимает и удаляет наш reply.
        </p>

        {guardResult && (
          <div className="mt-2 rounded-tg-btn bg-tg-good/10 px-3 py-2 text-tg-sm text-tg-good">
            Проверено: {guardResult.checked} · Ок: {guardResult.ok_count} · Откат: {guardResult.rolled_back} · Пропущено: {guardResult.skipped}
          </div>
        )}
        {guardError && (
          <div className="mt-2 rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">
            Ошибка guard: {guardError}
          </div>
        )}
      </div>
    </TgSection>
  )
}
```

- [ ] **Step 3: Write the security section**

Create `apps/desktop/src/components/settings/sections/SecuritySection.tsx`:

```tsx
import { useState } from 'react'
import { TgSection, TgSettingRow, TgTextField, TgButton, TgSlider } from '@/components/tg'
import { setPin } from '@/api/pin'
import { getLockTimeoutMinutes, setLockTimeoutMinutes } from '@/hooks/usePinGuard'

interface Props {
  pinSet?: boolean
  onPinChanged?: () => void
}

/** Digits only, at most six — the PIN format the backend accepts. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

export function SecuritySection({ pinSet, onPinChanged }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lockMinutes, setLockMinutes] = useState(() => getLockTimeoutMinutes())

  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  const submit = async () => {
    if (next !== confirm) {
      setError(pinSet ? 'Новый PIN не совпадает с подтверждением' : 'PIN не совпадает с подтверждением')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setPin(next, pinSet ? current : undefined)
      setSuccess(pinSet ? 'PIN изменён' : 'PIN установлен! При следующем запуске потребуется ввод PIN')
      setCurrent('')
      setNext('')
      setConfirm('')
      onPinChanged?.()
    } catch {
      setError(pinSet ? 'Неверный текущий PIN' : 'Ошибка установки PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <TgSection title="Безопасность">
      <TgSettingRow label="PIN-код" hint="Защита доступа к приложению и Telegram-сессии">
        <span
          className={
            pinSet
              ? 'rounded-tg-sm bg-tg-good/10 px-2 py-0.5 text-tg-sm text-tg-good'
              : 'rounded-tg-sm bg-[rgb(var(--tg-peer-3)/0.16)] px-2 py-0.5 text-tg-sm text-[rgb(var(--tg-peer-3))]'
          }
        >
          {pinSet ? 'Установлен' : 'Не установлен'}
        </span>
      </TgSettingRow>

      <div className="mx-[22px] mb-2 flex flex-col gap-2 rounded-tg-btn bg-tg-bg-over p-3">
        <p className="text-tg-box font-semibold text-tg-text-bold">
          {pinSet ? 'Сменить PIN' : 'Установить PIN'}
        </p>

        {pinSet && (
          <TgTextField
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="Текущий PIN"
            value={current}
            onChange={(v) => { setCurrent(onlyDigits(v)); clearMessages() }}
          />
        )}

        <TgTextField
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={pinSet ? 'Новый PIN (4-6 цифр)' : 'PIN (4-6 цифр)'}
          value={next}
          onChange={(v) => { setNext(onlyDigits(v)); clearMessages() }}
        />

        <TgTextField
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder={pinSet ? 'Повторите новый PIN' : 'Повторите PIN'}
          value={confirm}
          onChange={(v) => { setConfirm(onlyDigits(v)); clearMessages() }}
        />

        <TgButton
          onClick={submit}
          disabled={saving || next.length < 4 || (pinSet && !current)}
          className="self-start"
        >
          {saving ? 'Сохранение...' : pinSet ? 'Сменить PIN' : 'Установить PIN'}
        </TgButton>

        {error && <p className="text-tg-sm text-tg-danger">{error}</p>}
        {success && <p className="text-tg-sm text-tg-good">{success}</p>}
      </div>

      <TgSettingRow
        label="Автоблокировка"
        hint="Через сколько минут без действий запрашивать PIN (0 = выкл)"
      >
        <TgSlider
          value={lockMinutes}
          onChange={(v) => { setLockMinutes(v); setLockTimeoutMinutes(v) }}
          min={0}
          max={30}
        />
        <span className="min-w-[3rem] text-right text-tg-sm text-tg-text-sub">
          {lockMinutes === 0 ? 'Выкл' : `${lockMinutes} мин`}
        </span>
      </TgSettingRow>
    </TgSection>
  )
}
```

- [ ] **Step 4: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/settings/sections/CleanupSection.tsx apps/desktop/src/components/settings/sections/HistorySection.tsx apps/desktop/src/components/settings/sections/SecuritySection.tsx
git commit -m "feat: add the cleanup, history and security sections

Each keeps its own local state, so the shell no longer carries eighteen
useState calls for things only one block cares about. The PIN block folds
the set and change flows into one form, which removes a duplicated
hundred-line branch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Sections seven to nine

**Files:**
- Create: `apps/desktop/src/components/settings/sections/AppearanceSection.tsx`
- Create: `apps/desktop/src/components/settings/sections/UpdatesSection.tsx`
- Create: `apps/desktop/src/components/settings/sections/DiagnosticsSection.tsx`

**Interfaces:**
- Consumes: `SectionProps`; sound helpers from `@/lib/sound`; `fetchLogs` from `@/api/logs`; `parseLogLines` from `@/lib/log-parser`.
- Produces: `AppearanceSection(props: SectionProps)`, `UpdatesSection()`, `DiagnosticsSection()`.

- [ ] **Step 1: Write the appearance section**

Create `apps/desktop/src/components/settings/sections/AppearanceSection.tsx`:

```tsx
import { TgSection, TgSettingRow, TgToggle, TgSegmented } from '@/components/tg'
import {
  setSoundEnabled,
  setNotificationSound,
  playPreviewSound,
  setCustomSoundPath,
  getCustomSoundPath,
  SOUND_PRESETS,
} from '@/lib/sound'
import type { SoundPreset } from '@/lib/sound'
import type { SectionProps } from './TelegramSection'

export function AppearanceSection({ settings, patch }: SectionProps) {
  const displayMode = settings.task_display_mode || (settings.compact_mode ? 'compact' : 'standard')

  return (
    <TgSection title="Внешний вид">
      <TgSettingRow label="Системные уведомления" hint="Всплывающие тосты Windows">
        <TgToggle
          checked={settings.notifications_enabled}
          onChange={(v) => {
            patch('notifications_enabled', v)
            window.electronAPI?.setNotificationsEnabled(v)
          }}
          label="Системные уведомления"
        />
      </TgSettingRow>

      <TgSettingRow label="Звук уведомлений" hint="Только если уведомления включены">
        <TgToggle
          checked={settings.sound_enabled}
          onChange={(v) => {
            patch('sound_enabled', v)
            setSoundEnabled(v)
            // Electron notification stays silent — sound handled in renderer
            window.electronAPI?.setSoundEnabled(false)
          }}
          label="Звук уведомлений"
        />
      </TgSettingRow>

      {settings.sound_enabled && (
        <TgSettingRow label="Пресет звука">
          <select
            value={settings.notification_sound}
            onChange={(e) => {
              const preset = e.target.value as SoundPreset
              patch('notification_sound', preset)
              setNotificationSound(preset)
            }}
            className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
          >
            {(Object.entries(SOUND_PRESETS) as [SoundPreset, typeof SOUND_PRESETS[SoundPreset]][]).map(
              ([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label} — {meta.description}
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            onClick={() => playPreviewSound(settings.notification_sound as SoundPreset)}
            title="Проиграть выбранный звук"
            aria-label="Проиграть выбранный звук"
            className="rounded-tg-btn border border-tg-divider px-2 py-1 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            ▶
          </button>
        </TgSettingRow>
      )}

      {settings.sound_enabled && settings.notification_sound === 'custom' && (
        <TgSettingRow label="Путь к файлу" hint="MP3 или OGG, например: /sounds/my.mp3">
          <input
            type="text"
            defaultValue={getCustomSoundPath() ?? ''}
            placeholder="/sounds/custom.mp3"
            onBlur={(e) => setCustomSoundPath(e.target.value.trim() || null)}
            className="w-44 rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none placeholder:text-tg-placeholder focus:border-tg-line-active"
          />
          <button
            type="button"
            onClick={() => playPreviewSound('custom')}
            title="Проиграть кастомный звук"
            aria-label="Проиграть кастомный звук"
            className="rounded-tg-btn border border-tg-divider px-2 py-1 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            ▶
          </button>
        </TgSettingRow>
      )}

      <TgSettingRow label="Режим отображения задач" hint="Компактный / Стандартный / Развёрнутый">
        <TgSegmented
          options={[
            { id: 'compact', label: 'Компактный' },
            { id: 'standard', label: 'Стандартный' },
            { id: 'expanded', label: 'Развёрнутый' },
          ]}
          active={displayMode}
          onChange={(id) => patch('task_display_mode', id as 'compact' | 'standard' | 'expanded')}
        />
      </TgSettingRow>
    </TgSection>
  )
}
```

The custom sound path uses a plain `input` rather than `TgTextField`, because it keeps its value uncontrolled (`defaultValue` plus `onBlur`) so typing a path does not re-render the section on every keystroke.

- [ ] **Step 2: Write the updates section**

Create `apps/desktop/src/components/settings/sections/UpdatesSection.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Download, CheckCircle2 } from 'lucide-react'
import { TgSection, TgSettingRow, TgButton } from '@/components/tg'
import { cn } from '@/lib/utils'

interface UpdateState {
  status: 'idle' | 'unsupported' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  availableVersion: string | null
  progress: number
  message: string | null
  checkedAt: string | null
}

function parseUpdateState(value: unknown): UpdateState | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<UpdateState>
  if (typeof v.status !== 'string' || typeof v.currentVersion !== 'string') return null
  return {
    status: v.status as UpdateState['status'],
    currentVersion: v.currentVersion,
    availableVersion: typeof v.availableVersion === 'string' ? v.availableVersion : null,
    progress: typeof v.progress === 'number' ? v.progress : 0,
    message: typeof v.message === 'string' ? v.message : null,
    checkedAt: typeof v.checkedAt === 'string' ? v.checkedAt : null,
  }
}

export function UpdatesSection() {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)

  useEffect(() => {
    void window.electronAPI?.getVersion().then(setAppVersion)
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.updatesGetState || !api?.onUpdatesStateChanged) return

    let active = true
    void api.updatesGetState().then((state) => {
      if (active) setUpdateState(parseUpdateState(state))
    })
    const unsubscribe = api.onUpdatesStateChanged((state) => setUpdateState(parseUpdateState(state)))
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const handleCheck = useCallback(async () => {
    try {
      const state = await window.electronAPI?.updatesCheck?.()
      if (state) setUpdateState(parseUpdateState(state))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdateState((prev) => prev ? { ...prev, status: 'error', message: msg } : {
        status: 'error',
        currentVersion: appVersion ?? 'unknown',
        availableVersion: null,
        progress: 0,
        message: msg,
        checkedAt: new Date().toISOString(),
      })
    }
  }, [appVersion])

  const handleDownload = useCallback(async () => {
    try {
      const state = await window.electronAPI?.updatesDownload?.()
      if (state) setUpdateState(parseUpdateState(state))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdateState((prev) => prev ? { ...prev, status: 'error', message: msg } : null)
    }
  }, [])

  if (!window.electronAPI) {
    return (
      <TgSection title="Обновления приложения">
        <p className="px-[22px] pb-3 pt-1 text-tg-sm text-tg-text-sub">
          Обновления доступны только в desktop-сборке Electron.
        </p>
      </TgSection>
    )
  }

  return (
    <TgSection title="Обновления приложения">
      <TgSettingRow
        label="Текущая версия"
        hint={updateState?.availableVersion ? `Доступна версия ${updateState.availableVersion}` : undefined}
      >
        <span className="text-tg-sm text-tg-text-sub">
          v{updateState?.currentVersion ?? appVersion ?? '—'}
        </span>
      </TgSettingRow>

      {updateState?.message && (
        <p
          className={cn(
            'mx-[22px] mb-2 rounded-tg-btn px-3 py-2 text-tg-sm',
            updateState.status === 'error'
              ? 'bg-tg-danger/10 text-tg-danger'
              : 'bg-tg-bg-over text-tg-text-sub',
          )}
        >
          {updateState.message}
        </p>
      )}

      {updateState?.status === 'downloading' && (
        <div className="mx-[22px] mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tg-bg-over">
            <div
              className="h-full rounded-full bg-tg-accent transition-all"
              style={{ width: `${Math.max(0, Math.min(100, updateState.progress))}%` }}
            />
          </div>
          <span className="w-10 text-right text-tg-sm tabular-nums text-tg-text-sub">
            {Math.round(updateState.progress)}%
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-[22px] pb-2">
        <TgButton
          variant="light"
          onClick={handleCheck}
          disabled={updateState?.status === 'checking' || updateState?.status === 'downloading'}
          className="h-7 px-2.5 text-tg-sm"
        >
          {updateState?.status === 'checking'
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />}
          Проверить обновления
        </TgButton>

        {(updateState?.status === 'available' || updateState?.status === 'downloading') && (
          <TgButton
            variant="light"
            onClick={handleDownload}
            disabled={updateState?.status === 'downloading'}
            className="h-7 px-2.5 text-tg-sm"
          >
            {updateState?.status === 'downloading'
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Download className="h-3 w-3" />}
            {updateState?.status === 'downloading' ? 'Загрузка…' : 'Скачать'}
          </TgButton>
        )}

        {updateState?.status === 'downloaded' && (
          <TgButton onClick={() => window.electronAPI?.updatesInstall?.()} className="h-7 px-2.5 text-tg-sm">
            <CheckCircle2 className="h-3 w-3" />
            Перезапустить и установить
          </TgButton>
        )}
      </div>

      <p className="px-[22px] pb-3 text-tg-sm text-tg-text-sub">
        Автообновление поддерживается для установленной версии (NSIS). Portable обновляется вручную.
      </p>
    </TgSection>
  )
}
```

- [ ] **Step 3: Write the diagnostics section**

Create `apps/desktop/src/components/settings/sections/DiagnosticsSection.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { Loader2, RefreshCw, FolderOpen } from 'lucide-react'
import { TgSection, TgButton, TgSegmented } from '@/components/tg'
import { fetchLogs } from '@/api/logs'
import type { LogLevel, LogsResponse } from '@/api/logs'
import { parseLogLines } from '@/lib/log-parser'
import type { FriendlyEntry } from '@/lib/log-parser'
import { cn } from '@/lib/utils'

export function DiagnosticsSection() {
  const [logsData, setLogsData] = useState<LogsResponse | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsLevel, setLogsLevel] = useState<LogLevel>('ALL')
  const [logsLines, setLogsLines] = useState(200)
  const [logsMode, setLogsMode] = useState<'friendly' | 'raw'>('friendly')

  const handleLoadLogs = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      // Friendly mode: load 300 raw lines (parser discards noise, needs headroom)
      // Raw mode: use user-selected lines + level
      setLogsData(await fetchLogs(
        logsMode === 'friendly' ? 300 : logsLines,
        logsMode === 'friendly' ? 'ALL' : logsLevel,
      ))
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : String(err))
    } finally {
      setLogsLoading(false)
    }
  }, [logsLines, logsLevel, logsMode])

  return (
    <TgSection title="Диагностика">
      <div className="flex flex-wrap items-center gap-2 px-[22px] pb-2 pt-1">
        <TgSegmented
          options={[
            { id: 'friendly', label: 'Понятный' },
            { id: 'raw', label: 'Технический' },
          ]}
          active={logsMode}
          onChange={(id) => setLogsMode(id as 'friendly' | 'raw')}
        />

        {logsMode === 'raw' && (
          <>
            <select
              value={logsLevel}
              onChange={(e) => setLogsLevel(e.target.value as LogLevel)}
              className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
            >
              <option value="ALL">Все уровни</option>
              <option value="ERROR">Только ошибки</option>
              <option value="WARNING">Предупреждения</option>
              <option value="INFO">INFO</option>
            </select>
            <select
              value={logsLines}
              onChange={(e) => setLogsLines(Number(e.target.value))}
              className="rounded-tg-btn border border-tg-divider bg-tg-bg px-2 py-1 text-tg-sm text-tg-text outline-none focus:border-tg-line-active"
            >
              <option value={50}>50 строк</option>
              <option value={100}>100 строк</option>
              <option value={200}>200 строк</option>
              <option value={500}>500 строк</option>
            </select>
          </>
        )}

        <TgButton variant="light" onClick={handleLoadLogs} disabled={logsLoading} className="h-7 px-2.5 text-tg-sm">
          {logsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {logsData ? 'Обновить' : 'Загрузить'}
        </TgButton>

        {window.electronAPI && (
          <TgButton
            variant="light"
            onClick={() => window.electronAPI?.openLogsFolder()}
            title="Открыть папку с логами в Проводнике"
            className="h-7 px-2.5 text-tg-sm"
          >
            <FolderOpen className="h-3 w-3" />
            Папка логов
          </TgButton>
        )}
      </div>

      {logsError && (
        <p className="mx-[22px] mb-2 rounded-tg-btn bg-tg-danger/10 px-3 py-2 text-tg-sm text-tg-danger">
          Ошибка: {logsError}
        </p>
      )}

      {logsData && logsMode === 'friendly' && (() => {
        const entries: FriendlyEntry[] = parseLogLines(logsData.lines)
        if (entries.length === 0) {
          return (
            <p className="px-[22px] pb-3 text-tg-sm text-tg-text-sub">
              Нет событий для отображения. Попробуй «Технический» режим для деталей.
            </p>
          )
        }
        return (
          <div className="mx-[22px] mb-3 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {entries.map((e, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-tg-btn px-2 py-1.5 text-tg-sm',
                  e.isError ? 'bg-tg-danger/10'
                    : e.isWarning ? 'bg-[rgb(var(--tg-peer-3)/0.12)]'
                    : 'bg-tg-bg-over',
                )}
              >
                <span className="flex-none leading-[1.4]">{e.icon}</span>
                <span
                  className={cn(
                    'min-w-0 flex-1 leading-[1.5]',
                    e.isError ? 'text-tg-danger'
                      : e.isWarning ? 'text-[rgb(var(--tg-peer-3))]'
                      : 'text-tg-text',
                  )}
                >
                  {e.text}
                </span>
                <span className="flex-none tabular-nums text-tg-sm text-tg-text-sub">{e.time}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {logsData && logsMode === 'raw' && (
        logsData.lines.length === 0 ? (
          <p className="px-[22px] pb-3 text-tg-sm text-tg-text-sub">
            Лог пуст или нет строк выбранного уровня.
          </p>
        ) : (
          <div className="mx-[22px] mb-3 overflow-hidden rounded-tg-btn border border-tg-divider">
            <div className="flex items-center justify-between border-b border-tg-divider px-2 py-1">
              <span className="text-tg-sm text-tg-text-sub">{logsData.file}</span>
              <span className="text-tg-sm text-tg-text-sub">{logsData.total_lines} строк</span>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-tg-sm leading-[1.6]">
              {logsData.lines.map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    'block',
                    line.includes('ERROR') ? 'text-tg-danger'
                      : line.includes('WARNING') ? 'text-[rgb(var(--tg-peer-3))]'
                      : 'text-tg-text-sub',
                  )}
                >
                  {line}
                </span>
              ))}
            </pre>
          </div>
        )
      )}
    </TgSection>
  )
}
```

- [ ] **Step 4: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/settings/sections/AppearanceSection.tsx apps/desktop/src/components/settings/sections/UpdatesSection.tsx apps/desktop/src/components/settings/sections/DiagnosticsSection.tsx
git commit -m "feat: add the appearance, updates and diagnostics sections

Updates and diagnostics now own the state they use — version, update
progress, log level and lines — so none of it sits in the shell any more.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The settings shell

**Files:**
- Modify: `apps/desktop/src/components/settings/SettingsScreen.tsx` (full rewrite)

**Interfaces:**
- Consumes: all nine sections.
- Produces: `SettingsScreen` keeps its props: `onClose`, `pinSet?`, `onPinChanged?`, `onSaved?`.

- [ ] **Step 1: Rewrite the shell**

Replace the whole of `apps/desktop/src/components/settings/SettingsScreen.tsx`:

```tsx
/**
 * SettingsScreen — каркас настроек.
 *
 * Держит загруженные настройки, сохранение и шапку. Каждый раздел живёт
 * в своём файле в ./sections и получает settings и patch.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { getSettings, updateSettings, restartListener } from '@/api/settings'
import type { AppSettings } from '@/types/settings'
import { TgIconButton, TgButton } from '@/components/tg'
import { cn } from '@/lib/utils'
import { TelegramSection } from './sections/TelegramSection'
import { FiltersSection } from './sections/FiltersSection'
import { ReactionSection } from './sections/ReactionSection'
import { CleanupSection } from './sections/CleanupSection'
import { HistorySection } from './sections/HistorySection'
import { SecuritySection } from './sections/SecuritySection'
import { AppearanceSection } from './sections/AppearanceSection'
import { UpdatesSection } from './sections/UpdatesSection'
import { DiagnosticsSection } from './sections/DiagnosticsSection'

interface Props {
  onClose: () => void
  pinSet?: boolean
  onPinChanged?: () => void
  /** Called after a successful save — lets parent refresh the task list */
  onSaved?: () => void
}

export function SettingsScreen({ onClose, pinSet, onPinChanged, onSaved }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    void window.electronAPI?.getVersion().then(setAppVersion)
  }, [])

  const loadSettings = useCallback(() => {
    setLoadError(null)
    getSettings()
      .then(setSettings)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Failed to load settings:', msg)
        setLoadError(msg)
      })
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const patch = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev)
  }, [])

  const save = useCallback(async () => {
    if (!settings) return
    setSaving(true)
    try {
      setSettings(await updateSettings(settings))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      onSaved?.()
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }, [settings, onSaved])

  /** Save settings AND restart the Telethon listener (for chat/thread changes) */
  const saveAndRestart = useCallback(async () => {
    if (!settings) return
    setRestarting(true)
    try {
      setSettings(await updateSettings(settings))
      await restartListener()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
      onSaved?.()
    } catch (err) {
      console.error('Failed to save & restart:', err)
    } finally {
      setRestarting(false)
    }
  }, [settings, onSaved])

  return (
    <div className="flex h-full flex-col bg-tg-bg">
      {/* Header */}
      <div className="flex h-11 flex-none items-center gap-2 border-b border-tg-divider px-2 pl-1">
        <TgIconButton label="Назад" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </TgIconButton>
        <span className="text-tg-box font-semibold text-tg-text-bold">Настройки</span>

        <div className="ml-auto flex items-center gap-1.5">
          <TgButton
            onClick={save}
            disabled={saving || restarting || !settings}
            className={cn('h-7 px-2.5 text-tg-sm', savedFlash && 'bg-tg-good hover:bg-tg-good')}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : savedFlash ? '✓ Ok' : 'Сохранить'}
          </TgButton>

          <TgButton
            variant="light"
            onClick={saveAndRestart}
            disabled={saving || restarting || !settings}
            title="Сохранить настройки и перезапустить слушатель чатов"
            className="h-7 px-2.5 text-tg-sm"
          >
            {restarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Применить
          </TgButton>
        </div>
      </div>

      {/* Body */}
      {loadError !== null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-tg-base text-tg-text-sub">Не удалось загрузить настройки</p>
          <p className="max-w-[280px] break-all rounded-tg-btn bg-tg-danger/10 px-3 py-2 font-mono text-tg-sm text-tg-danger">
            {loadError || 'Unknown error'}
          </p>
          <TgButton variant="light" onClick={loadSettings}>
            <RefreshCw className="h-3 w-3" />
            Повторить
          </TgButton>
        </div>
      ) : !settings ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-tg-text-sub" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TelegramSection settings={settings} patch={patch} />
          <FiltersSection settings={settings} patch={patch} />
          <ReactionSection settings={settings} patch={patch} />
          <CleanupSection settings={settings} patch={patch} />
          <HistorySection settings={settings} patch={patch} />
          <SecuritySection pinSet={pinSet} onPinChanged={onPinChanged} />
          <AppearanceSection settings={settings} patch={patch} />
          <UpdatesSection />
          <DiagnosticsSection />

          {appVersion && (
            <p className="py-3 text-center text-tg-sm text-tg-text-sub">
              TG Focus Filter v{appVersion}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check everything**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
npm run build
```

Expected: no type errors, 42 tests pass, build succeeds.

- [ ] **Step 3: Confirm the old palette is gone from settings**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rnE "indigo|amber|emerald|slate|bg-card|text-muted-foreground|rounded-xl" src/components/settings
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/settings/SettingsScreen.tsx
git commit -m "refactor: reduce the settings screen to a shell

1383 lines become about 180: state, save, header, and nine sections it
assembles. Everything else moved into its own file in the previous three
commits.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Stage check

- [ ] **Step 1: Run every automated check**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
npx tsc -b
npm run build
```

Expected: 42 tests pass, no type errors, build succeeds.

- [ ] **Step 2: Start the app**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
env -u ELECTRON_RUN_AS_NODE npm run dev
```

If it refuses with "Port 5173 is already in use", free the port first:

```bash
powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen | Select -Expand OwningProcess -Unique | ForEach { Stop-Process -Id \$_ -Force }"
```

- [ ] **Step 3: Walk the inventory**

Open `docs/superpowers/specs/2026-09-14-stage-3-inventory.md` and check every line against the running app. The items most likely to have been lost:

1. Every one of the nine blocks is present and in order.
2. Сохранить shows «✓ Ok» after saving; Применить restarts the listener.
3. Filters: five settings, the sort switch has two options and the right one is highlighted.
4. Reactions: eight emoji, the reply field appears only when the reply toggle is on, the delay slider shows seconds in its hint, the custom-reply block has the «как основная» choice.
5. Cleanup: both confirmations appear with their exact wording, including the two-line inbox warning.
6. History: manual scan reports counts; Guard reports counts; both errors render.
7. Security: with a PIN set there are three fields, without one there are two; the wrong-PIN and mismatch messages appear; the auto-lock slider says «Выкл» at zero.
8. Appearance: sound preset list appears only when sound is on; the custom path row only for the «custom» preset; both ▶ buttons play.
9. Updates: version row; outside Electron the substitute line.
10. Diagnostics: both modes, the level and lines selectors only in the technical mode, «Папка логов» opens the folder.
11. Chat picker: search, refresh, ticks, and removing a group clears its threads; tabs paginate by three; «Все» and «Сброс» behave as described.
12. At 340px width nothing overflows sideways.

- [ ] **Step 4: Commit any fixes**

If the walk found nothing, the stage is done. If it found problems, fix them, re-run Step 1, and commit with a `fix:` message naming what was lost and restored.

---

## What stays for later stages

Stage 4 covers statistics, the Telegram login screen, the PIN screen and the update dialog, and deletes `SetupWizard`. Stage 5 removes `AnimatedGradientBg`, `ThemeToggler` and the shadcn colour aliases from the Tailwind config, and adds the high-contrast switch to the settings screen built here.
