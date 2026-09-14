# Telegram Redesign, Stage 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the task list, the task card and the task detail window into Telegram Desktop: rows instead of cards, a context menu instead of fifteen buttons on every row, and a toast instead of a banner.

**Architecture:** The card stops being a card and becomes a `TgRow` with an author avatar in one of Telegram's eight participant colours. Three actions stay on the row, the rest move into a popup menu opened by right-click or by a three-dot button. Pure formatting logic that is currently copy-pasted between the card and the detail window moves into `src/lib/task-format.ts` and gets tests. Business logic stays in `useTasks` and is not touched.

**Tech Stack:** React 18, TypeScript 5.5, Tailwind 3.4, framer-motion 11, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-13-telegram-redesign-design.md`
**Behaviour inventory (the contract this stage must not break):** `docs/superpowers/specs/2026-09-14-stage-2-inventory.md`

## Global Constraints

- Work continues on branch `redesign/telegram`. The app must start after every task.
- Do not modify `src/hooks/*`, `src/api/*`, `src/types/*`, `src/lib/date.ts`, `src/lib/text.ts`, `src/lib/sound.ts`, or anything under `services/`. New files in `src/lib/` are allowed.
- `useTasks` is the contract and does not change. Its shape is listed in the inventory document.
- Every colour comes from a `--tg-*` token via a `tg-` Tailwind class. Never a hex value, never `bg-indigo-500` or any other Tailwind palette class.
- Every duration comes from `TG_MS` in `src/lib/tg-motion.ts`. Never a duration literal in a component.
- Radius: `rounded-tg-btn` (4px) for buttons, `rounded-tg-box` (8px) for menus and windows, `rounded-tg-sm` (3px) for small plates. Never `rounded-xl`.
- Minimum font size 12px (`text-tg-sm`). Body text is `text-tg-base` (13px).
- Every Russian string listed in the inventory is preserved exactly, including punctuation and the ellipsis character.
- Run `npx tsc -b` and `npm test` before every commit. Both must be clean.
- Commit messages: English, imperative, `feat:` / `fix:` / `refactor:` prefix, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

Created:

| File | Responsibility |
|---|---|
| `apps/desktop/src/lib/task-format.ts` | Pure formatting shared by card and detail window: Telegram links, relative time, snooze wording, chat label, link splitting |
| `apps/desktop/src/lib/task-format.test.ts` | Tests for the above |
| `apps/desktop/src/components/tg/menu-position.ts` | Pure geometry: where a popup menu opens so it stays on screen |
| `apps/desktop/src/components/tg/menu-position.test.ts` | Tests for the above |
| `apps/desktop/src/components/tg/TgPopupMenu.tsx` | Telegram popup menu: 8px radius, opens from the click point, closes on outside click and Escape |
| `apps/desktop/src/components/tg/TgToast.tsx` | Bottom toast with one action, 200/160/1000 ms |
| `apps/desktop/src/components/tg/TgSearchField.tsx` | Rounded search field with a clear cross |
| `apps/desktop/src/components/tg/TgAvatar.tsx` | Round author avatar with initials, coloured by chat id |
| `apps/desktop/src/components/tasks/TaskRowMenu.tsx` | The task-specific menu contents, built on `TgPopupMenu` |

Modified:

| File | Change |
|---|---|
| `apps/desktop/src/components/tasks/TaskCard.tsx` | Rewritten as a Telegram row |
| `apps/desktop/src/components/tasks/TaskList.tsx` | Rewritten: search field, toast, empty states, drag and drop on rows |
| `apps/desktop/src/components/tasks/TaskDetailModal.tsx` | Rewritten on the kit, shared formatting pulled from `task-format.ts` |
| `apps/desktop/src/components/tg/index.ts` | New exports |
| `apps/desktop/src/components/layout/AppShell.tsx` | The list area loses its padding; rows run edge to edge |

---

## Task 1: Shared formatting, with tests

Right now `buildTgLinks`, the URL splitter and the snooze options exist twice, once in `TaskCard.tsx` and once in `TaskDetailModal.tsx`, with small differences. Both rewrites need them, so they move out first.

**Files:**
- Create: `apps/desktop/src/lib/task-format.ts`
- Test: `apps/desktop/src/lib/task-format.test.ts`

**Interfaces:**
- Consumes: `parseBackendDate`, `withDeviceTimeZone` from `@/lib/date` (unchanged).
- Produces:
  - `buildTgLinks(chatId: string, messageId: number): { deep: string; web: string }`
  - `formatChatLabel(chatId: string): string`
  - `formatTime(iso: string): string`
  - `formatSnoozedUntil(iso: string): string`
  - `formatFullDate(iso: string): string`
  - `splitUrls(text: string): Array<{ kind: 'text' | 'link'; value: string; href?: string; trailing?: string }>`
  - `SNOOZE_OPTIONS: Array<{ label: string; minutes: () => number }>`
  - `PRIORITY_ORDER: TaskPriority[]`
  - `nextPriority(current: TaskPriority): TaskPriority`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/lib/task-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildTgLinks,
  formatChatLabel,
  splitUrls,
  nextPriority,
  SNOOZE_OPTIONS,
} from './task-format'

describe('buildTgLinks', () => {
  it('builds a private-channel link for a -100 supergroup id', () => {
    const links = buildTgLinks('-1001234567890', 42)
    expect(links.deep).toBe('tg://privatepost?channel=1234567890&post=42')
    expect(links.web).toBe('https://t.me/c/1234567890/42')
  })

  it('builds a username link for a non-numeric id', () => {
    const links = buildTgLinks('@durov', 7)
    expect(links.deep).toBe('tg://resolve?domain=durov&post=7')
    expect(links.web).toBe('https://t.me/durov/7')
  })

  it('keeps the legacy shape for a positive numeric id', () => {
    const links = buildTgLinks('12345', 3)
    expect(links.deep).toBe('https://t.me/12345/3')
    expect(links.web).toBe('https://t.me/12345/3')
  })
})

describe('formatChatLabel', () => {
  it('shortens a negative chat id to its last four digits', () => {
    expect(formatChatLabel('-1001234567890')).toBe('чат …7890')
  })

  it('leaves a username alone', () => {
    expect(formatChatLabel('@team')).toBe('@team')
  })
})

describe('splitUrls', () => {
  it('returns plain text as a single chunk', () => {
    const parts = splitUrls('просто текст')
    expect(parts).toEqual([{ kind: 'text', value: 'просто текст' }])
  })

  it('finds a link and gives it an href', () => {
    const parts = splitUrls('см. https://example.com дальше')
    const link = parts.find((p) => p.kind === 'link')
    expect(link?.value).toBe('https://example.com')
    expect(link?.href).toBe('https://example.com')
  })

  it('adds a scheme to a bare www link', () => {
    const parts = splitUrls('www.example.com')
    expect(parts[0].href).toBe('https://www.example.com')
  })

  it('keeps trailing punctuation out of the link', () => {
    const parts = splitUrls('открой https://example.com.')
    const link = parts.find((p) => p.kind === 'link')
    expect(link?.value).toBe('https://example.com')
    expect(link?.trailing).toBe('.')
  })

  it('keeps a closing bracket out of the link', () => {
    const parts = splitUrls('(https://example.com)')
    const link = parts.find((p) => p.kind === 'link')
    expect(link?.value).toBe('https://example.com')
    expect(link?.trailing).toBe(')')
  })
})

describe('nextPriority', () => {
  it('cycles normal → high → medium → low → normal', () => {
    expect(nextPriority('normal')).toBe('high')
    expect(nextPriority('high')).toBe('medium')
    expect(nextPriority('medium')).toBe('low')
    expect(nextPriority('low')).toBe('normal')
  })
})

describe('SNOOZE_OPTIONS', () => {
  it('offers exactly the three Telegram-style delays', () => {
    expect(SNOOZE_OPTIONS.map((o) => o.label)).toEqual(['1 час', '3 часа', 'Завтра утром'])
  })

  it('gives an hour and three hours in minutes', () => {
    expect(SNOOZE_OPTIONS[0].minutes()).toBe(60)
    expect(SNOOZE_OPTIONS[1].minutes()).toBe(180)
  })

  it('gives tomorrow morning as a positive number of minutes under two days', () => {
    const m = SNOOZE_OPTIONS[2].minutes()
    expect(m).toBeGreaterThan(0)
    expect(m).toBeLessThan(48 * 60)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: FAIL, "Failed to resolve import ./task-format".

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/lib/task-format.ts`:

```ts
/**
 * Formatting shared by the task row and the task window.
 *
 * All of it is pure: same input, same output, no DOM. That is what makes it
 * testable, and it used to be duplicated in two components with small
 * differences between the copies.
 */
import type { TaskPriority } from '@/types/task'
import { parseBackendDate, withDeviceTimeZone } from '@/lib/date'

/** Links to one Telegram message: the desktop app link and the web fallback. */
export function buildTgLinks(chatId: string, messageId: number): { deep: string; web: string } {
  const num = parseInt(chatId, 10)
  if (!isNaN(num) && num < 0) {
    // Supergroups and channels carry a -100 prefix that the links do not use.
    const cleanId = String(Math.abs(num)).replace(/^100/, '')
    return {
      deep: `tg://privatepost?channel=${cleanId}&post=${messageId}`,
      web: `https://t.me/c/${cleanId}/${messageId}`,
    }
  }
  if (!isNaN(num)) {
    return {
      deep: `https://t.me/${chatId}/${messageId}`,
      web: `https://t.me/${chatId}/${messageId}`,
    }
  }
  const normalized = chatId.replace(/^@/, '')
  return {
    deep: `tg://resolve?domain=${normalized}&post=${messageId}`,
    web: `https://t.me/${normalized}/${messageId}`,
  }
}

/** A chat id a person can recognise, when the real name is not known yet. */
export function formatChatLabel(chatId: string): string {
  const num = parseInt(chatId, 10)
  if (!isNaN(num) && num < 0) return `чат …${String(Math.abs(num)).slice(-4)}`
  return chatId
}

/** YYYY-MM-DD in the device timezone, for comparing calendar days. */
function toLocalDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', withDeviceTimeZone({}))
}

/** Telegram-style message time: today as a clock, yesterday and older as a date. */
export function formatTime(iso: string): string {
  const d = parseBackendDate(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000)
  const timeStr = d.toLocaleTimeString('ru-RU', withDeviceTimeZone({ hour: '2-digit', minute: '2-digit' }))

  const dDateStr = toLocalDateStr(d)
  const nowDateStr = toLocalDateStr(now)
  const ydDateStr = toLocalDateStr(new Date(now.getTime() - 86_400_000))

  if (dDateStr === nowDateStr) {
    if (diffMin < 1) return 'только что'
    return timeStr
  }
  if (dDateStr === ydDateStr) return `вчера ${timeStr}`

  const dateStr = d.toLocaleDateString('ru-RU', withDeviceTimeZone({ day: 'numeric', month: 'short' }))
  return `${dateStr} ${timeStr}`
}

/** How long until a snoozed task comes back. */
export function formatSnoozedUntil(iso: string): string {
  const d = parseBackendDate(iso)
  const now = new Date()
  const diffMin = Math.ceil((d.getTime() - now.getTime()) / 60_000)
  if (diffMin <= 0) return 'скоро'
  if (diffMin < 60) return `${diffMin} мин`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} ч`
  return d.toLocaleDateString('ru-RU', withDeviceTimeZone({ day: 'numeric', month: 'short' }))
}

/** Full date in words, for the task window. */
export function formatFullDate(iso: string): string {
  return parseBackendDate(iso).toLocaleString('ru-RU', withDeviceTimeZone({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }))
}

const URL_SPLIT_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
const URL_CHECK_RE = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i

export interface TextChunk {
  kind: 'text' | 'link'
  value: string
  /** Link only: where it points, with a scheme added to bare www links. */
  href?: string
  /** Link only: punctuation that followed the link and is not part of it. */
  trailing?: string
}

/**
 * Splits a message into text and links.
 *
 * Trailing punctuation is peeled off the link, otherwise a sentence-ending
 * full stop becomes part of the address and the link breaks.
 */
export function splitUrls(text: string): TextChunk[] {
  return text.split(URL_SPLIT_RE).reduce<TextChunk[]>((acc, chunk) => {
    if (!chunk) return acc
    if (!URL_CHECK_RE.test(chunk)) {
      acc.push({ kind: 'text', value: chunk })
      return acc
    }
    let core = chunk
    let trailing = ''
    while (core && /[),.;!?]$/.test(core)) {
      trailing = core.slice(-1) + trailing
      core = core.slice(0, -1)
    }
    if (!core) {
      acc.push({ kind: 'text', value: chunk })
      return acc
    }
    acc.push({
      kind: 'link',
      value: core,
      href: core.startsWith('www.') ? `https://${core}` : core,
      trailing: trailing || undefined,
    })
    return acc
  }, [])
}

function minutesUntilTomorrow9am(): number {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return Math.ceil((tomorrow.getTime() - now.getTime()) / 60_000)
}

/** The three delays the app offers, unchanged from the old card. */
export const SNOOZE_OPTIONS = [
  { label: '1 час', minutes: () => 60 },
  { label: '3 часа', minutes: () => 180 },
  { label: 'Завтра утром', minutes: minutesUntilTomorrow9am },
]

/** Priority cycle order, as clicking the priority badge walked it. */
export const PRIORITY_ORDER: TaskPriority[] = ['normal', 'high', 'medium', 'low']

export function nextPriority(current: TaskPriority): TaskPriority {
  const idx = PRIORITY_ORDER.indexOf(current)
  return PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length]
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: PASS. Total across the project is now 8 + 17 = 25 tests.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/lib/task-format.ts apps/desktop/src/lib/task-format.test.ts
git commit -m "refactor: extract shared task formatting

buildTgLinks, the URL splitter and the snooze delays existed twice, in
the card and in the detail window, with small differences between the
copies. They move into one tested module before both are rewritten.

The URL splitter is the part worth testing: a link followed by a full
stop used to swallow the stop into the address.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Popup menu

**Files:**
- Create: `apps/desktop/src/components/tg/menu-position.ts`
- Test: `apps/desktop/src/components/tg/menu-position.test.ts`
- Create: `apps/desktop/src/components/tg/TgPopupMenu.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `TG_MS` from `@/lib/tg-motion`, `useRipple` from `./useRipple`.
- Produces:
  - `menuPosition(args: { x: number; y: number; menuWidth: number; menuHeight: number; viewportWidth: number; viewportHeight: number; margin?: number }): { left: number; top: number; originX: 'left' | 'right'; originY: 'top' | 'bottom' }`
  - `<TgPopupMenu open anchor={{ x: number; y: number } | null} onClose={() => void} items={TgMenuItem[]} />`
  - `interface TgMenuItem { id: string; label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void }`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/components/tg/menu-position.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { menuPosition } from './menu-position'

const VIEW = { viewportWidth: 420, viewportHeight: 680 }

describe('menuPosition', () => {
  it('opens down and to the right when there is room', () => {
    const p = menuPosition({ x: 40, y: 100, menuWidth: 160, menuHeight: 200, ...VIEW })
    expect(p.left).toBe(40)
    expect(p.top).toBe(100)
    expect(p.originX).toBe('left')
    expect(p.originY).toBe('top')
  })

  it('flips to the left when the menu would run past the right edge', () => {
    const p = menuPosition({ x: 400, y: 100, menuWidth: 160, menuHeight: 200, ...VIEW })
    expect(p.left).toBe(400 - 160)
    expect(p.originX).toBe('right')
  })

  it('flips upward when the menu would run past the bottom edge', () => {
    const p = menuPosition({ x: 40, y: 600, menuWidth: 160, menuHeight: 200, ...VIEW })
    expect(p.top).toBe(600 - 200)
    expect(p.originY).toBe('bottom')
  })

  it('never positions the menu off the top or left edge', () => {
    const p = menuPosition({ x: 2, y: 2, menuWidth: 300, menuHeight: 600, ...VIEW })
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })

  it('keeps a menu taller than the window inside the window', () => {
    const p = menuPosition({ x: 40, y: 300, menuWidth: 160, menuHeight: 900, ...VIEW })
    expect(p.top).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeLessThanOrEqual(VIEW.viewportHeight)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: FAIL, "Failed to resolve import ./menu-position".

- [ ] **Step 3: Write the geometry**

Create `apps/desktop/src/components/tg/menu-position.ts`:

```ts
export interface MenuPositionArgs {
  /** Click point, in viewport coordinates. */
  x: number
  y: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  /** Minimum gap to the window edge. */
  margin?: number
}

export interface MenuPosition {
  left: number
  top: number
  /** Which corner the opening animation grows from. */
  originX: 'left' | 'right'
  originY: 'top' | 'bottom'
}

/**
 * Where a popup menu goes so that it stays on screen.
 *
 * The window is 420px wide at its default size, so a menu opened near the
 * right edge has to flip rather than be clipped.
 */
export function menuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
}: MenuPositionArgs): MenuPosition {
  const flipX = x + menuWidth > viewportWidth - margin
  const flipY = y + menuHeight > viewportHeight - margin

  const rawLeft = flipX ? x - menuWidth : x
  const rawTop = flipY ? y - menuHeight : y

  return {
    left: Math.max(margin, Math.min(rawLeft, viewportWidth - menuWidth - margin)),
    top: Math.max(margin, Math.min(rawTop, viewportHeight - menuHeight - margin)),
    originX: flipX ? 'right' : 'left',
    originY: flipY ? 'bottom' : 'top',
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: PASS, 30 tests in total.

- [ ] **Step 5: Write the menu component**

Create `apps/desktop/src/components/tg/TgPopupMenu.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { TG_MS } from '@/lib/tg-motion'
import { menuPosition } from './menu-position'
import { useRipple } from './useRipple'

export interface TgMenuItem {
  id: string
  label: string
  icon?: ReactNode
  /** Destructive action: red label and icon. */
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface Props {
  open: boolean
  /** Click point in viewport coordinates, or null when closed. */
  anchor: { x: number; y: number } | null
  onClose: () => void
  items: TgMenuItem[]
}

/**
 * Telegram popup menu: 8px radius, 156px minimum width, item padding
 * 17/8/17/7, and it grows from the corner nearest the click.
 */
export function TgPopupMenu({ open, anchor, onClose, items }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0, originX: 'left', originY: 'top' } as ReturnType<typeof menuPosition>)

  // Measure after mount, before paint, so the menu never flashes in the
  // wrong place on its way to the right one.
  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(menuPosition({
      x: anchor.x,
      y: anchor.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }))
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || !anchor) return null

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        transformOrigin: `${pos.originY} ${pos.originX}`,
        animationDuration: `${TG_MS.menuShow}ms`,
      }}
      className={cn(
        'z-[9999] min-w-[156px] max-w-[300px] overflow-hidden py-2',
        'rounded-tg-box bg-tg-menu-bg text-tg-text',
        'shadow-[0_1px_3px_var(--tg-shadow),0_8px_24px_var(--tg-shadow)]',
        'animate-[tg-menu-in_200ms_ease-out]',
      )}
    >
      {items.map((item) => (
        <MenuItem key={item.id} item={item} onClose={onClose} />
      ))}
    </div>,
    document.body,
  )
}

function MenuItem({ item, onClose }: { item: TgMenuItem; onClose: () => void }) {
  const ripple = useRipple()

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        item.onSelect()
        onClose()
      }}
      {...ripple}
      className={cn(
        'relative flex w-full items-center gap-[10px] overflow-hidden',
        'px-[17px] pb-[7px] pt-2 text-left text-tg-base',
        'transition-colors duration-tg-universal',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        'disabled:pointer-events-none disabled:text-tg-menu-disabled',
        item.danger
          ? 'text-tg-danger hover:bg-[var(--tg-danger-bg-over)]'
          : 'text-tg-text hover:bg-tg-bg-over',
      )}
    >
      {item.icon && (
        <span className={cn('flex-none', item.danger ? 'text-tg-danger' : 'text-tg-menu-icon')}>
          {item.icon}
        </span>
      )}
      {item.label}
    </button>
  )
}
```

- [ ] **Step 6: Add the opening animation**

In `apps/desktop/src/index.css`, after the `tg-ripple-out` keyframes and before the reduced-motion block, add:

```css
/* Telegram panel animation: width first, then height, opacity fastest.
   Proportions from defaultPanelAnimation in widgets.style. */
@keyframes tg-menu-in {
  0%   { opacity: 0; transform: scale(0.4, 0.2); }
  30%  { opacity: 1; }
  60%  { transform: scale(1, 0.55); }
  100% { opacity: 1; transform: scale(1, 1); }
}
```

- [ ] **Step 7: Export it**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgPopupMenu } from './TgPopupMenu'
export type { TgMenuItem } from './TgPopupMenu'
export { menuPosition } from './menu-position'
```

- [ ] **Step 8: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/menu-position.ts apps/desktop/src/components/tg/menu-position.test.ts apps/desktop/src/components/tg/TgPopupMenu.tsx apps/desktop/src/components/tg/index.ts apps/desktop/src/index.css
git commit -m "feat: add the Telegram popup menu

Opens from the click point and grows width first, then height, the way
defaultPanelAnimation does. The placement maths is a pure function with
tests: the window is 420px wide by default, so a menu opened near an edge
has to flip rather than be clipped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Toast and search field

**Files:**
- Create: `apps/desktop/src/components/tg/TgToast.tsx`
- Create: `apps/desktop/src/components/tg/TgSearchField.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `TG_MS` from `@/lib/tg-motion`, framer-motion.
- Produces:
  - `<TgToast open text={string} actionLabel?={string} onAction?={() => void} onDismiss={() => void} durationMs?={number} />` — pinned to the bottom of its positioned parent.
  - `<TgSearchField value onChange placeholder inputRef? onEscape? />`

- [ ] **Step 1: Write the toast**

Create `apps/desktop/src/components/tg/TgToast.tsx`:

```tsx
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TG_MS } from '@/lib/tg-motion'

interface Props {
  open: boolean
  text: string
  /** Optional action, e.g. "Отменить". */
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  /** How long the toast stays before it fades. */
  durationMs?: number
}

/**
 * Telegram toast: appears in 200ms while sliding 160ms, waits, then fades
 * over a full second. Sits at the bottom of the nearest positioned parent.
 */
export function TgToast({
  open,
  text,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 5000,
}: Props) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(t)
  }, [open, durationMs, onDismiss])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: TG_MS.toastIn / 1000, ease: 'easeOut' },
            y: { duration: TG_MS.toastSlide / 1000, ease: 'easeOut' },
          }}
          className="absolute inset-x-[13px] bottom-[13px] z-[80] flex items-center gap-3 rounded-tg-box px-[19px] pb-3 pt-[13px] text-tg-base text-white"
          style={{ background: 'rgba(20, 28, 36, 0.92)' }}
        >
          <span className="min-w-0 flex-1 truncate">{text}</span>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="flex-none p-1 text-tg-base font-semibold uppercase tracking-wide text-tg-accent-text"
            >
              {actionLabel}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

The exit transition has no explicit duration for `y` on purpose: Telegram fades a toast out without sliding it.

- [ ] **Step 2: Write the search field**

Create `apps/desktop/src/components/tg/TgSearchField.tsx`:

```tsx
import type { RefObject } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (next: string) => void
  placeholder: string
  inputRef?: RefObject<HTMLInputElement | null>
  /** Escape in the field: the caller decides what to clear. */
  onEscape?: () => void
  className?: string
}

/** Telegram search: a rounded quiet field, with a cross once it has text. */
export function TgSearchField({ value, onChange, placeholder, inputRef, onEscape, className }: Props) {
  return (
    <div className={cn('relative flex h-8 items-center', className)}>
      <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-tg-placeholder" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          onEscape?.()
          e.currentTarget.blur()
        }}
        placeholder={placeholder}
        className={cn(
          'h-full w-full rounded-full bg-tg-search pl-9 pr-9 text-tg-base text-tg-text',
          'outline-none transition-colors duration-tg-universal',
          'placeholder:text-tg-placeholder',
          'focus:outline focus:outline-2 focus:outline-offset-[-2px] focus:outline-tg-accent',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
          className="absolute right-2 grid h-6 w-6 place-items-center rounded-full text-tg-placeholder transition-colors duration-tg-menu hover:text-tg-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Export both**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgToast } from './TgToast'
export { TgSearchField } from './TgSearchField'
```

- [ ] **Step 4: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgToast.tsx apps/desktop/src/components/tg/TgSearchField.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add the Telegram toast and search field

Toast timings come from defaultToast: 200ms to appear, 160ms of slide, a
full second to fade. It is where the undo action moves to, out of the
banner that used to push the list down.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Author avatar

**Files:**
- Create: `apps/desktop/src/components/tg/TgAvatar.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `peerColorVar` from `@/lib/peer-color`.
- Produces: `<TgAvatar name={string} colorKey={string} size?={number} />` — a round avatar with up to two initials.

- [ ] **Step 1: Write it**

Create `apps/desktop/src/components/tg/TgAvatar.tsx`:

```tsx
import { peerColorVar } from '@/lib/peer-color'
import { cn } from '@/lib/utils'

interface Props {
  /** Display name; its initials go inside the circle. */
  name: string
  /** What the colour is derived from — the chat id, so a chat keeps its colour. */
  colorKey: string
  size?: number
  className?: string
}

/** Up to two initials, the way Telegram builds them from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function TgAvatar({ name, colorKey, size = 34, className }: Props) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: peerColorVar(colorKey) }}
      className={cn(
        'grid flex-none place-items-center rounded-full font-semibold text-white',
        size >= 34 ? 'text-tg-base' : 'text-tg-sm',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
```

- [ ] **Step 2: Export it**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgAvatar } from './TgAvatar'
```

- [ ] **Step 3: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgAvatar.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add the author avatar

Telegram colours participants from a fixed set of eight; the task list now
does the same, keyed on chat id so an author keeps their colour between
launches.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The task row

This is the biggest rewrite in the stage. `TaskCard.tsx` goes from a bordered card with fifteen click targets to a Telegram row with three.

**Files:**
- Create: `apps/desktop/src/components/tasks/TaskRowMenu.tsx`
- Modify: `apps/desktop/src/components/tasks/TaskCard.tsx` (full rewrite)

**Interfaces:**
- Consumes: everything from Tasks 1 to 4, `TgRow`, `TgButton`, `TgIconButton` from `@/components/tg`, `stripAllMentions` from `@/lib/text`, `parsePeerReactions` from `@/types/task`.
- Produces: `TaskCard` keeps its current props exactly, so `TaskList` does not have to change in the same task. The full list is in the inventory document; nothing is added or removed.

- [ ] **Step 1: Write the menu contents**

Create `apps/desktop/src/components/tasks/TaskRowMenu.tsx`:

```tsx
import { Maximize2, ExternalLink, Pin, PinOff, Flag, Trash2, RotateCcw } from 'lucide-react'
import { TgPopupMenu } from '@/components/tg'
import type { TgMenuItem } from '@/components/tg'
import type { Task } from '@/types/task'
import { buildTgLinks, nextPriority } from '@/lib/task-format'

interface Props {
  task: Task
  open: boolean
  anchor: { x: number; y: number } | null
  onClose: () => void
  onOpenDetail?: () => void
  onPriorityChange: (id: number, priority: Task['priority']) => void
  onPin?: (id: number) => void
  onDismiss: (id: number) => void
  onReopen: (id: number) => void
}

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  normal: 'Обычный',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
}

/**
 * Everything that used to sit on the card as a button and now lives one
 * right-click away. Which items appear depends on the tab the task is in.
 */
export function TaskRowMenu({
  task,
  open,
  anchor,
  onClose,
  onOpenDetail,
  onPriorityChange,
  onPin,
  onDismiss,
  onReopen,
}: Props) {
  const isInbox = task.status === 'inbox'
  const isPinned = task.sort_order !== null && task.sort_order < 0
  const chatId = task.chat_id || task.source_chat || ''
  const links = buildTgLinks(chatId, task.source_message_id)

  const items: TgMenuItem[] = []

  if (onOpenDetail) {
    items.push({
      id: 'detail',
      label: 'Подробности',
      icon: <Maximize2 className="h-4 w-4" />,
      onSelect: onOpenDetail,
    })
  }

  items.push({
    id: 'telegram',
    label: 'Открыть в Telegram',
    icon: <ExternalLink className="h-4 w-4" />,
    onSelect: () => window.electronAPI?.openExternal(links.deep),
  })

  if (isInbox) {
    items.push({
      id: 'priority',
      label: `Приоритет: ${PRIORITY_LABEL[task.priority]}`,
      icon: <Flag className="h-4 w-4" />,
      onSelect: () => onPriorityChange(task.id, nextPriority(task.priority)),
    })

    if (onPin) {
      items.push({
        id: 'pin',
        label: isPinned ? 'Открепить' : 'Закрепить вверху',
        icon: isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />,
        onSelect: () => onPin(task.id),
      })
    }

    items.push({
      id: 'dismiss',
      label: 'Убрать из списка',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onSelect: () => onDismiss(task.id),
    })
  } else {
    items.push({
      id: 'reopen',
      label: task.status === 'done' ? 'Вернуть' : 'В inbox',
      icon: <RotateCcw className="h-4 w-4" />,
      onSelect: () => onReopen(task.id),
    })
  }

  return <TgPopupMenu open={open} anchor={anchor} onClose={onClose} items={items} />
}
```

- [ ] **Step 2: Rewrite the row**

Replace the whole of `apps/desktop/src/components/tasks/TaskCard.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Clock, Eye, MoreVertical, GripVertical, ChevronDown } from 'lucide-react'
import type { Task, TaskPriority } from '@/types/task'
import { parsePeerReactions } from '@/types/task'
import { cn } from '@/lib/utils'
import { stripAllMentions } from '@/lib/text'
import { TgRow, TgAvatar, TgIconButton, TgPopupMenu } from '@/components/tg'
import type { TgMenuItem } from '@/components/tg'
import { TG_MS } from '@/lib/tg-motion'
import { peerColorVar } from '@/lib/peer-color'
import {
  formatChatLabel,
  formatTime,
  formatSnoozedUntil,
  splitUrls,
  SNOOZE_OPTIONS,
} from '@/lib/task-format'
import { TaskRowMenu } from './TaskRowMenu'

const UNDO_TIMEOUT_MS = 5000

/** Only two priorities get a stripe; normal and low are quiet, as in the spec. */
const PRIORITY_STRIPE: Record<TaskPriority, string | null> = {
  high: 'bg-tg-danger',
  medium: 'bg-[rgb(var(--tg-peer-3))]',
  normal: null,
  low: null,
}

interface Props {
  task: Task
  onDone: (id: number, customReply?: string) => void
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onReopen: (id: number) => void
  onPriorityChange: (id: number, priority: TaskPriority) => void
  onPin?: (id: number) => void
  onStartWork?: (id: number) => void
  loadingId: number | null
  compact?: boolean
  /** When true, body is always visible without clicking "Развернуть" */
  forceExpanded?: boolean
  chatNames?: Map<string, string>
  threadNames?: Map<string, string>
  isDragging?: boolean
  /** Card is in "done, undo available" state — shows inline undo UI */
  isPendingDone?: boolean
  onUndoDone?: () => void
  onDoneExpire?: () => void
  isCommitFailed?: boolean
  onOpenDetail?: () => void
  onDragHandleStart?: () => void
  onDragHandleEnd?: () => void
  /** Selected by keyboard navigation */
  selected?: boolean
  onSelect?: () => void
}

/** Renders message text with clickable links. */
function LinkedText({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  return (
    <>
      {splitUrls(text).map((chunk, i) =>
        chunk.kind === 'text' ? (
          <span key={`${keyPrefix}-${i}`}>{chunk.value}</span>
        ) : (
          <span key={`${keyPrefix}-${i}`}>
            <a
              href={chunk.href}
              target="_blank"
              rel="noreferrer"
              className="break-all text-tg-accent-text underline decoration-dotted underline-offset-2"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (chunk.href) window.electronAPI?.openExternal(chunk.href)
              }}
            >
              {chunk.value}
            </a>
            {chunk.trailing}
          </span>
        ),
      )}
    </>
  )
}

export function TaskCard({
  task,
  onDone,
  onDismiss,
  onSnooze,
  onReopen,
  onPriorityChange,
  onPin,
  onStartWork,
  loadingId,
  compact = false,
  forceExpanded = false,
  chatNames,
  threadNames,
  isDragging = false,
  isPendingDone = false,
  onUndoDone,
  onDoneExpire,
  isCommitFailed = false,
  onOpenDetail,
  onDragHandleStart,
  onDragHandleEnd,
  selected = false,
  onSelect,
}: Props) {
  const isLoading = loadingId === task.id
  const isDone = task.status === 'done'
  const isSnoozed = task.status === 'snoozed'
  const isInbox = task.status === 'inbox'
  const isPinned = task.sort_order !== null && task.sort_order < 0
  const isInProgress = task.in_progress

  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const [snoozeAnchor, setSnoozeAnchor] = useState<{ x: number; y: number } | null>(null)
  const [expandedLocal, setExpandedLocal] = useState(false)
  const expanded = forceExpanded || expandedLocal
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const replyInputRef = useRef<HTMLInputElement>(null)
  const [undoProgress, setUndoProgress] = useState(100)

  useEffect(() => {
    if (!isPendingDone) {
      setUndoProgress(100)
      return
    }
    setUndoProgress(100)
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / UNDO_TIMEOUT_MS) * 100)
      setUndoProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onDoneExpire?.()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [isPendingDone, onDoneExpire])

  useEffect(() => {
    if (replyOpen) setTimeout(() => replyInputRef.current?.focus(), 50)
  }, [replyOpen])

  const chatId = task.chat_id || task.source_chat || ''
  const chatLabel = chatNames?.get(chatId) ?? formatChatLabel(chatId)
  const threadLabel = task.thread_id
    ? (threadNames?.get(`${chatId}:${task.thread_id}`) ?? `тема #${task.thread_id}`)
    : null
  const authorName = task.sender_first_name || task.sender_username || chatLabel
  // Same colour the avatar uses, so name and circle always match.
  const authorColor = peerColorVar(chatId)

  const snoozeItems: TgMenuItem[] = SNOOZE_OPTIONS.map((opt) => ({
    id: opt.label,
    label: opt.label,
    icon: <Clock className="h-4 w-4" />,
    onSelect: () => onSnooze(task.id, opt.minutes()),
  }))

  const handleDoneDefault = () => {
    setReplyOpen(false)
    onDone(task.id, undefined)
  }

  const handleDoneWithReply = () => {
    const text = replyText.trim()
    setReplyOpen(false)
    setReplyText('')
    onDone(task.id, text || undefined)
  }

  // ── Undo strip ────────────────────────────────────────────────────────────

  if (isPendingDone) {
    return (
      <motion.div
        layout
        className="relative flex items-center gap-2 overflow-hidden border-b border-tg-divider px-3 py-3"
      >
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-tg-accent"
          style={{ width: `${undoProgress}%` }}
        />
        <span className="min-w-0 flex-1 truncate text-tg-base text-tg-text-sub">
          ✅{' '}
          <span className="font-semibold text-tg-text">
            {task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}
          </span>
          {' '}выполнено
        </span>
        <button
          type="button"
          onClick={onUndoDone}
          className="flex-none rounded-tg-btn px-2.5 py-1 text-tg-sm font-semibold text-tg-accent-text transition-colors duration-tg-universal hover:bg-tg-bg-over"
        >
          Отменить
        </button>
      </motion.div>
    )
  }

  // ── Row ───────────────────────────────────────────────────────────────────

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: TG_MS.slideWrap / 1000, ease: 'easeOut' }}
    >
      <TgRow
        selected={selected}
        onActivate={onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuAnchor({ x: e.clientX, y: e.clientY })
        }}
        className={cn('group px-3 py-2', isDone && 'opacity-60')}
      >
        {/* Priority stripe */}
        {PRIORITY_STRIPE[task.priority] && (
          <span
            aria-hidden="true"
            className={cn('absolute inset-y-0 left-0 w-[3px]', PRIORITY_STRIPE[task.priority])}
          />
        )}

        <div className="flex gap-2.5">
          <TgAvatar name={authorName} colorKey={chatId} size={compact ? 28 : 34} />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* Author and time */}
            <div className="flex items-baseline gap-2">
              <span
                className="min-w-0 flex-1 truncate text-tg-base font-semibold"
                style={{ color: authorColor }}
              >
                {authorName}
              </span>
              <span className="flex-none text-tg-sm tabular-nums text-tg-row-date">
                {isSnoozed && task.snoozed_until
                  ? `⏰ ${formatSnoozedUntil(task.snoozed_until)}`
                  : formatTime(task.created_at)}
              </span>
            </div>

            {/* Title */}
            <p
              className={cn(
                'break-words text-tg-base leading-snug text-tg-row-name',
                compact ? 'line-clamp-1' : expanded ? '' : 'line-clamp-2',
              )}
            >
              <LinkedText text={stripAllMentions(task.title)} keyPrefix={`title-${task.id}`} />
            </p>

            {/* Body when expanded */}
            {!compact && expanded && task.body && (
              <p className="whitespace-pre-wrap break-words text-tg-sm leading-relaxed text-tg-row-text">
                <LinkedText text={stripAllMentions(task.body)} keyPrefix={`body-${task.id}`} />
              </p>
            )}

            {/* Expand toggle */}
            {!compact && !forceExpanded && task.body && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedLocal((v) => !v)
                }}
                className="flex items-center gap-0.5 self-start text-tg-sm text-tg-accent-text"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform duration-tg-menu', expandedLocal && 'rotate-180')} />
                {expandedLocal ? 'Свернуть' : 'Развернуть'}
              </button>
            )}

            {/* Source line */}
            {!compact && (
              <p className="truncate text-tg-sm text-tg-row-text">
                из {chatLabel}
                {threadLabel ? ` · ${threadLabel}` : ''}
              </p>
            )}

            {/* Badges */}
            {!compact && (
              <div className="flex flex-wrap items-center gap-1.5">
                {isPinned && (
                  <span className="rounded-tg-sm bg-tg-bg-over px-1.5 py-0.5 text-tg-sm text-tg-text-sub">
                    закреплено
                  </span>
                )}
                {task.source_changed && (
                  <span
                    title="Сообщение в Telegram отредактировано и больше не соответствует текущим правилам/mention"
                    className="rounded-tg-sm bg-[rgb(var(--tg-peer-3)/0.16)] px-1.5 py-0.5 text-tg-sm text-[rgb(var(--tg-peer-3))]"
                  >
                    ⚠ источник изменён
                  </span>
                )}
                {isCommitFailed && (
                  <span
                    title="Не удалось отправить реакцию в Telegram. Проверьте логи."
                    className="rounded-tg-sm bg-tg-danger/15 px-1.5 py-0.5 text-tg-sm text-tg-danger"
                  >
                    ⚠ Реакция не отправлена
                  </span>
                )}
                {task.media_type && (
                  <span className="rounded-tg-sm bg-tg-bg-over px-1.5 py-0.5 text-tg-sm text-tg-text-sub">
                    {task.media_type === 'photo' ? '📎 Фото'
                      : task.media_type === 'video' ? '🎥 Видео'
                      : task.media_type === 'voice' ? '🔊 Голосовое'
                      : task.media_type === 'audio' ? '🔊 Аудио'
                      : task.media_type === 'location' ? '📎 Геолокация'
                      : '📎 Вложение'}
                  </span>
                )}
                {parsePeerReactions(task.peer_reactions).length > 0 && (() => {
                  const reactions = parsePeerReactions(task.peer_reactions)
                  const byEmoji = reactions.reduce<Record<string, typeof reactions>>((acc, r) => {
                    acc[r.emoji] = acc[r.emoji] ?? []
                    acc[r.emoji].push(r)
                    return acc
                  }, {})
                  return Object.entries(byEmoji).map(([emoji, peers]) => (
                    <span
                      key={emoji}
                      title={peers.map((p) => p.first_name || p.username || p.user_id || '?').join(', ')}
                      className="rounded-tg-sm bg-tg-bg-over px-1.5 py-0.5 text-tg-sm text-tg-text-sub"
                    >
                      {emoji} {peers.map((p) => p.first_name || p.username || '?').join(', ')}
                    </span>
                  ))
                })()}
              </div>
            )}

            {/* Custom reply */}
            {replyOpen && (
              <div className="flex items-center gap-1.5 rounded-tg-btn bg-tg-bg-over px-2 py-1">
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDoneWithReply()
                    if (e.key === 'Escape') { setReplyOpen(false); setReplyText('') }
                  }}
                  placeholder="Свой ответ (Enter — отправить)"
                  className="min-w-0 flex-1 bg-transparent text-tg-sm text-tg-text outline-none placeholder:text-tg-placeholder"
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDoneWithReply() }}
                  className="flex-none rounded-tg-btn bg-tg-btn px-2 py-0.5 text-tg-on-accent"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Three actions */}
            <div className="mt-1 flex items-center gap-1">
              {isInbox ? (
                <>
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDoneDefault() }}
                      disabled={isLoading}
                      className="flex h-7 items-center gap-1.5 rounded-l-tg-btn bg-tg-btn px-2.5 text-tg-sm font-semibold text-tg-on-accent transition-colors duration-tg-universal hover:bg-tg-btn-over disabled:opacity-50"
                    >
                      {isLoading
                        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        : <Check className="h-3.5 w-3.5" />}
                      Выполнено
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setReplyOpen((v) => !v) }}
                      disabled={isLoading}
                      title="Свой ответ"
                      aria-label="Свой ответ"
                      className="flex h-7 items-center rounded-r-tg-btn border-l border-tg-btn-over bg-tg-btn px-1.5 text-tg-on-accent transition-colors duration-tg-universal hover:bg-tg-btn-over disabled:opacity-50"
                    >
                      <ChevronDown className={cn('h-3 w-3 transition-transform duration-tg-menu', replyOpen && 'rotate-180')} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSnoozeAnchor({ x: e.clientX, y: e.clientY })
                    }}
                    disabled={isLoading}
                    className="flex h-7 items-center gap-1 rounded-tg-btn px-2 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over disabled:opacity-50"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Отложить
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onStartWork?.(task.id) }}
                    disabled={isLoading || !onStartWork}
                    title={isInProgress ? 'Снять статус "В работе"' : 'Отметить: "В работу" (👀)'}
                    className={cn(
                      'flex h-7 items-center gap-1 rounded-tg-btn px-2 text-tg-sm transition-colors duration-tg-universal disabled:opacity-50',
                      isInProgress
                        ? 'bg-tg-accent/15 text-tg-accent-text'
                        : 'text-tg-text-sub hover:bg-tg-bg-over',
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {isInProgress ? 'В работе' : 'В работу'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onReopen(task.id) }}
                  disabled={isLoading}
                  className="flex h-7 items-center gap-1 rounded-tg-btn px-2 text-tg-sm text-tg-accent-text transition-colors duration-tg-universal hover:bg-tg-bg-over disabled:opacity-50"
                >
                  {isDone ? 'Вернуть' : 'В inbox'}
                </button>
              )}

              <div className="ml-auto flex items-center gap-0.5">
                {isDragging && !isPinned && (
                  <span
                    draggable
                    onDragStart={onDragHandleStart}
                    onDragEnd={onDragHandleEnd}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab px-1 text-tg-text-sub opacity-0 transition-opacity duration-tg-universal group-hover:opacity-100 active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                )}
                <TgIconButton
                  label="Ещё"
                  size={26}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuAnchor({ x: e.clientX, y: e.clientY })
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </TgIconButton>
              </div>
            </div>
          </div>
        </div>
      </TgRow>

      <TaskRowMenu
        task={task}
        open={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        onOpenDetail={onOpenDetail}
        onPriorityChange={onPriorityChange}
        onPin={onPin}
        onDismiss={onDismiss}
        onReopen={onReopen}
      />

      <TgPopupMenu
        open={snoozeAnchor !== null}
        anchor={snoozeAnchor}
        onClose={() => setSnoozeAnchor(null)}
        items={snoozeItems}
      />
    </motion.div>
  )
}
```

One deliberate change: the "Открыть в Telegram" link that used to be a button in the corner is now a menu item, so the row no longer builds Telegram links itself. `TaskRowMenu` builds them.

- [ ] **Step 3: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tasks/TaskCard.tsx apps/desktop/src/components/tasks/TaskRowMenu.tsx
git commit -m "feat: rebuild the task card as a Telegram row

The card had fifteen click targets on every row. Three stay — done,
snooze, start work — with the custom reply still one click away behind the
caret on the done button. The rest move into a right-click menu.

The author now gets an avatar and one of Telegram's eight participant
colours, and the row answers the keyboard, which the card never did.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The list

**Files:**
- Modify: `apps/desktop/src/components/tasks/TaskList.tsx` (full rewrite)
- Modify: `apps/desktop/src/components/layout/AppShell.tsx` (drop the padding around the list)

**Interfaces:**
- Consumes: `TaskCard` from Task 5, `TgSearchField`, `TgToast`, `TgButton` from `@/components/tg`.
- Produces: `TaskList` keeps its current props: `tab`, `compact?`, `displayMode?`, `onInboxCountChange?`, `onEscape?`, `refreshTrigger?`, `overlayOpen?`.

- [ ] **Step 1: Rewrite the list**

Replace the whole of `apps/desktop/src/components/tasks/TaskList.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2, Trash2, X } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { TaskDetailModal } from './TaskDetailModal'
import { TgSearchField, TgToast, TgButton } from '@/components/tg'
import { useTasks } from '@/hooks/useTasks'
import { useChatNames } from '@/hooks/useChatNames'
import { useThreadNames } from '@/hooks/useThreadNames'
import { useKeyboard } from '@/hooks/useKeyboard'
import { clearDoneTasks } from '@/api/tasks'
import type { TabId, Task, TaskPriority } from '@/types/task'
import { cn } from '@/lib/utils'
import { nativeConfirm } from '@/lib/dialog'

interface Props {
  tab: TabId
  /** @deprecated use displayMode instead */
  compact?: boolean
  displayMode?: 'compact' | 'standard' | 'expanded'
  onInboxCountChange?: (count: number) => void
  /** Called when Escape is pressed (e.g. to close settings panel) */
  onEscape?: () => void
  /** Increment to force-refetch tasks (e.g. after sort settings change) */
  refreshTrigger?: number
  /** Settings/Stats overlay is open — list is hidden, so shortcuts must be off */
  overlayOpen?: boolean
}

export function TaskList({
  tab,
  compact = false,
  displayMode,
  onInboxCountChange,
  onEscape,
  refreshTrigger,
  overlayOpen = false,
}: Props) {
  const effectiveMode = displayMode ?? (compact ? 'compact' : 'standard')
  const {
    tasks,
    loading,
    error,
    actionError,
    loadingId,
    pendingUndo,
    pendingDismiss,
    failedCommitIds,
    handleDone,
    handleDismiss,
    handleSnooze,
    handleReopen,
    handleUndoDone,
    handleUndoDismiss,
    clearActionError,
    handlePriorityChange,
    handleReorder,
    handlePin,
    handleStartWork,
    clearUndo,
    refetch,
    setTasks,
  } = useTasks(tab, refreshTrigger)

  const [clearing, setClearing] = useState(false)
  const [search, setSearch] = useState('')
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const chatNames = useChatNames()
  const threadNames = useThreadNames(tasks)

  const visibleTasks = search.trim()
    ? tasks.filter((t) => {
        const q = search.toLowerCase()
        return (
          t.title.toLowerCase().includes(q) ||
          (t.body ?? '').toLowerCase().includes(q)
        )
      })
    : tasks

  const { selectedTaskId, setSelectedTaskId } = useKeyboard({
    tasks: visibleTasks,
    onDone: (id) => void handleDone(id),
    onUndo: pendingUndo ? () => void handleUndoDone(pendingUndo.id) : null,
    searchInputRef,
    onEscape,
    enabled: tab === 'inbox' && !overlayOpen,
  })

  // Action errors fade on their own; the list underneath never goes away
  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(clearActionError, 5000)
    return () => clearTimeout(t)
  }, [actionError, clearActionError])

  // ── Drag-and-drop state ──────────────────────────────────────────────────
  const dragIdRef = useRef<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  /** Закреплённая задача: sort_order < 0. Нельзя перетаскивать и нельзя бросать на неё. */
  const isPinnedTask = (task: Task) => task.sort_order !== null && task.sort_order < 0

  const handleClearDone = useCallback(async () => {
    const ok = await nativeConfirm('Удалить все выполненные задачи?')
    if (!ok) return
    setClearing(true)
    try {
      await clearDoneTasks()
      await refetch()
    } catch {
      // ignore
    } finally {
      setClearing(false)
    }
  }, [refetch])

  useEffect(() => {
    if (tab === 'inbox') onInboxCountChange?.(tasks.length)
  }, [tab, tasks.length, onInboxCountChange])

  const onDragStart = (id: number) => {
    const task = tasks.find((t) => t.id === id)
    if (task && isPinnedTask(task)) return
    dragIdRef.current = id
  }

  const onDragOver = (e: React.DragEvent, overId: number) => {
    e.preventDefault()
    const overTask = tasks.find((t) => t.id === overId)
    if (overTask && isPinnedTask(overTask)) return
    if (dragIdRef.current !== overId) setDragOverId(overId)
  }

  const onDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    const fromId = dragIdRef.current
    if (fromId === null || fromId === targetId) {
      setDragOverId(null)
      return
    }

    const fromTask = tasks.find((t) => t.id === fromId)
    const toTask = tasks.find((t) => t.id === targetId)

    if ((fromTask && isPinnedTask(fromTask)) || (toTask && isPinnedTask(toTask))) {
      dragIdRef.current = null
      setDragOverId(null)
      return
    }

    setTasks((prev: Task[]) => {
      const pinned = prev.filter((t) => isPinnedTask(t))
      const nonPinned = prev.filter((t) => !isPinnedTask(t))

      const fromIdx = nonPinned.findIndex((t) => t.id === fromId)
      const toIdx = nonPinned.findIndex((t) => t.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev

      const [moved] = nonPinned.splice(fromIdx, 1)
      nonPinned.splice(toIdx, 0, moved)

      const next = [...pinned, ...nonPinned]
      void handleReorder(next.map((t) => t.id))
      return next
    })

    dragIdRef.current = null
    setDragOverId(null)
  }

  const onDragEnd = () => {
    dragIdRef.current = null
    setDragOverId(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-tg-text-sub" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-tg-base text-tg-text-sub">{error}</p>
        <p className="text-tg-sm text-tg-text-sub">
          Убедитесь, что бэкенд запущен на порту 8787
        </p>
      </div>
    )
  }

  const emptyText = tab === 'inbox'
    ? 'Нет активных'
    : tab === 'done'
      ? 'Нет завершённых'
      : 'Нет отложенных'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Search */}
      {tasks.length > 0 && (
        <div className="flex-none px-2 py-2">
          <TgSearchField
            value={search}
            onChange={setSearch}
            placeholder="Поиск по задачам... (Ctrl+F)"
            inputRef={searchInputRef}
            onEscape={() => setSearch('')}
          />
        </div>
      )}

      {/* Clear all done */}
      {tab === 'done' && tasks.length > 0 && (
        <div className="flex flex-none justify-end px-2 pb-1">
          <TgButton variant="attention" onClick={handleClearDone} disabled={clearing} className="h-7 px-2 text-tg-sm">
            {clearing
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2 className="h-3 w-3" />}
            Очистить все
          </TgButton>
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div
          role="alert"
          className="mx-2 mb-1 flex flex-none items-start gap-2 rounded-tg-btn bg-tg-danger/12 px-3 py-2 text-tg-sm text-tg-danger"
        >
          <span className="min-w-0 flex-1 break-words">Не получилось: {actionError}</span>
          <button
            type="button"
            onClick={clearActionError}
            aria-label="Скрыть сообщение"
            className="shrink-0 rounded p-0.5 transition-colors duration-tg-universal hover:bg-tg-danger/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-tg-base text-tg-text-sub">{emptyText}</p>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center">
            <p className="text-tg-sm text-tg-text-sub">Ничего не найдено</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleTasks.map((task) => (
              <div
                key={task.id}
                onDragOver={(e) => onDragOver(e, task.id)}
                onDrop={(e) => onDrop(e, task.id)}
                className={cn(
                  'transition-opacity duration-tg-universal',
                  dragIdRef.current === task.id && 'opacity-40',
                  dragOverId === task.id && !isPinnedTask(task) && 'bg-tg-bg-over',
                )}
              >
                <TaskCard
                  task={task}
                  compact={effectiveMode === 'compact'}
                  forceExpanded={effectiveMode === 'expanded'}
                  chatNames={chatNames}
                  threadNames={threadNames}
                  onDone={handleDone}
                  onDismiss={handleDismiss}
                  onSnooze={handleSnooze}
                  onReopen={handleReopen}
                  onPriorityChange={(id: number, p: TaskPriority) => handlePriorityChange(id, p)}
                  onPin={tab === 'inbox' ? handlePin : undefined}
                  onStartWork={tab === 'inbox' ? handleStartWork : undefined}
                  loadingId={loadingId}
                  isDragging={tab === 'inbox' && !isPinnedTask(task)}
                  onDragHandleStart={() => onDragStart(task.id)}
                  onDragHandleEnd={onDragEnd}
                  isPendingDone={pendingUndo?.id === task.id}
                  onUndoDone={() => handleUndoDone(task.id)}
                  onDoneExpire={clearUndo}
                  isCommitFailed={failedCommitIds.has(task.id)}
                  onOpenDetail={() => setDetailTask(task)}
                  selected={selectedTaskId === task.id}
                  onSelect={() => setSelectedTaskId(task.id)}
                />
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Dismiss undo moved from a banner into a toast */}
      <TgToast
        open={pendingDismiss !== null}
        text={pendingDismiss ? `Убрано: ${pendingDismiss.title}` : ''}
        actionLabel="Отменить"
        onAction={handleUndoDismiss}
        onDismiss={() => {/* the hook owns the timer; nothing to do here */}}
      />

      <TaskDetailModal
        task={detailTask}
        chatNames={chatNames}
        threadNames={threadNames}
        loadingId={loadingId}
        onClose={() => setDetailTask(null)}
        onDone={handleDone}
        onDismiss={handleDismiss}
        onSnooze={handleSnooze}
        onReopen={handleReopen}
        onPriorityChange={handlePriorityChange}
      />
    </div>
  )
}
```

- [ ] **Step 2: Let the rows run edge to edge**

In `apps/desktop/src/components/layout/AppShell.tsx`, the main area currently pads the list:

```tsx
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
```

Telegram rows touch the window edges and scroll inside the list itself, so replace that line with:

```tsx
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
```

- [ ] **Step 3: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tasks/TaskList.tsx apps/desktop/src/components/layout/AppShell.tsx
git commit -m "feat: rebuild the task list on Telegram rows

Rows run edge to edge and scroll inside the list, as they do in Telegram.
The undo for a dismissed task moves from a banner that pushed the list
down into a toast over it, and the search box becomes the rounded
Telegram field.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The task window

**Files:**
- Modify: `apps/desktop/src/components/tasks/TaskDetailModal.tsx` (full rewrite)

**Interfaces:**
- Consumes: Task 1 formatting, `TgButton`, `TgAvatar`, `TgPopupMenu` from `@/components/tg`.
- Produces: `TaskDetailModal` keeps its props: `task`, `chatNames?`, `threadNames?`, `loadingId`, `onClose`, `onDone`, `onDismiss`, `onSnooze`, `onReopen`, `onPriorityChange`.

- [ ] **Step 1: Rewrite it**

Replace the whole of `apps/desktop/src/components/tasks/TaskDetailModal.tsx`:

```tsx
/**
 * TaskDetailModal — полный вид задачи в модальном окне.
 *
 * Показывает автора, чат, тему, дату, полный текст, вложение и реакции.
 * Действия внизу повторяют строку списка и закрывают окно.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Check, RotateCcw, Clock } from 'lucide-react'
import type { Task, TaskPriority } from '@/types/task'
import { parsePeerReactions } from '@/types/task'
import { cn } from '@/lib/utils'
import { stripAllMentions } from '@/lib/text'
import { TgButton, TgAvatar, TgIconButton, TgPopupMenu } from '@/components/tg'
import type { TgMenuItem } from '@/components/tg'
import { TG_MS } from '@/lib/tg-motion'
import {
  buildTgLinks,
  formatChatLabel,
  formatFullDate,
  splitUrls,
  SNOOZE_OPTIONS,
  nextPriority,
} from '@/lib/task-format'

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  normal: 'Обычный',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
}

interface Props {
  task: Task | null
  chatNames?: Map<string, string>
  threadNames?: Map<string, string>
  loadingId: number | null
  onClose: () => void
  onDone: (id: number) => void
  onDismiss: (id: number) => void
  onSnooze: (id: number, minutes: number) => void
  onReopen: (id: number) => void
  onPriorityChange: (id: number, priority: TaskPriority) => void
}

function LinkedText({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  return (
    <>
      {splitUrls(text).map((chunk, i) =>
        chunk.kind === 'text' ? (
          <span key={`${keyPrefix}-${i}`}>{chunk.value}</span>
        ) : (
          <span key={`${keyPrefix}-${i}`}>
            <a
              href={chunk.href}
              target="_blank"
              rel="noreferrer"
              className="break-all text-tg-accent-text underline decoration-dotted underline-offset-2"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (chunk.href) window.electronAPI?.openExternal(chunk.href)
              }}
            >
              {chunk.value}
            </a>
            {chunk.trailing}
          </span>
        ),
      )}
    </>
  )
}

export function TaskDetailModal({
  task,
  chatNames,
  threadNames,
  loadingId,
  onClose,
  onDone,
  onDismiss,
  onSnooze,
  onReopen,
  onPriorityChange,
}: Props) {
  const [snoozeAnchor, setSnoozeAnchor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!task) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [task, onClose])

  const snoozeItems: TgMenuItem[] = task
    ? SNOOZE_OPTIONS.map((opt) => ({
        id: opt.label,
        label: opt.label,
        icon: <Clock className="h-4 w-4" />,
        onSelect: () => { onSnooze(task.id, opt.minutes()); onClose() },
      }))
    : []

  return createPortal(
    <AnimatePresence>
      {task && (() => {
        const chatId = task.chat_id || task.source_chat || ''
        const links = buildTgLinks(chatId, task.source_message_id)
        const chatLabel = chatNames?.get(chatId) ?? formatChatLabel(chatId)
        const threadLabel = task.thread_id
          ? (threadNames?.get(`${chatId}:${task.thread_id}`) ?? `тема #${task.thread_id}`)
          : null
        const authorName = task.sender_first_name || task.sender_username || `id:${task.sender_id ?? '?'}`
        const username = task.sender_username?.replace(/^@/, '')
        const reactions = parsePeerReactions(task.peer_reactions)
        const byEmoji = reactions.reduce<Record<string, typeof reactions>>((acc, r) => {
          acc[r.emoji] = acc[r.emoji] ?? []
          acc[r.emoji].push(r)
          return acc
        }, {})

        return (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: TG_MS.fadeWrap / 1000, ease: 'linear' }}
              className="fixed inset-0 z-[90]"
              style={{ background: 'var(--tg-layer)' }}
              onClick={onClose}
            />

            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: TG_MS.menuShow / 1000, ease: 'easeOut' }}
              className="fixed inset-x-3 bottom-3 top-9 z-[95] flex flex-col overflow-hidden rounded-tg-box bg-tg-box-bg shadow-[0_1px_3px_var(--tg-shadow),0_12px_32px_var(--tg-shadow)]"
            >
              {/* Header */}
              <div className="flex flex-none items-center gap-2 border-b border-tg-divider px-3 py-2.5">
                <TgAvatar name={authorName} colorKey={chatId} size={30} />
                <div className="min-w-0 flex-1">
                  {username ? (
                    <button
                      type="button"
                      title={task.sender_username ?? undefined}
                      onClick={() => window.electronAPI?.openExternal(`tg://resolve?domain=${username}`)}
                      className="block max-w-full truncate text-tg-box font-semibold text-tg-text-bold"
                    >
                      {authorName}
                    </button>
                  ) : (
                    <span className="block truncate text-tg-box font-semibold text-tg-text-bold">
                      {authorName}
                    </span>
                  )}
                  <span className="block truncate text-tg-sm text-tg-text-sub">
                    {chatLabel}{threadLabel ? ` · ${threadLabel}` : ''} · {formatFullDate(task.created_at)}
                  </span>
                </div>
                <TgIconButton label="Закрыть" onClick={onClose}>
                  <X className="h-4 w-4" />
                </TgIconButton>
              </div>

              {/* Source changed warning */}
              {task.source_changed && (
                <div className="flex-none border-b border-tg-divider bg-[rgb(var(--tg-peer-3)/0.12)] px-3 py-2 text-tg-sm text-[rgb(var(--tg-peer-3))]">
                  Сообщение в Telegram было отредактировано и больше не соответствует текущим правилам/mention.
                </div>
              )}

              {/* Body */}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
                <p className="whitespace-pre-wrap break-words text-tg-base leading-relaxed text-tg-text">
                  <LinkedText
                    text={stripAllMentions(task.body || task.title)}
                    keyPrefix={`modal-body-${task.id}`}
                  />
                </p>

                {task.media_type && (
                  <div className="flex items-center gap-3 rounded-tg-btn bg-tg-bg-over px-3 py-2.5">
                    <span className="text-[20px]">
                      {task.media_type === 'video' ? '🎥'
                        : task.media_type === 'voice' || task.media_type === 'audio' ? '🔊'
                        : '📎'}
                    </span>
                    <span className="flex-1 text-tg-sm text-tg-text-sub">
                      {task.media_type === 'photo' ? 'Фото'
                        : task.media_type === 'video' ? 'Видео'
                        : task.media_type === 'voice' ? 'Голосовое сообщение'
                        : task.media_type === 'audio' ? 'Аудио'
                        : task.media_type === 'location' ? 'Геолокация'
                        : 'Вложение'}
                    </span>
                    <TgButton
                      variant="light"
                      className="h-7 px-2 text-tg-sm"
                      onClick={() => window.electronAPI?.openExternal(links.deep)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Открыть в Telegram
                    </TgButton>
                  </div>
                )}

                {reactions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-tg-sm text-tg-text-sub">Реакции коллег:</span>
                    {Object.entries(byEmoji).map(([emoji, peers]) => (
                      <span
                        key={emoji}
                        className="rounded-tg-sm bg-tg-bg-over px-2 py-0.5 text-tg-sm text-tg-text-sub"
                      >
                        {emoji} {peers.map((p) => p.first_name || p.username || '?').join(', ')}
                      </span>
                    ))}
                  </div>
                )}

                {task.status === 'inbox' && (
                  <button
                    type="button"
                    onClick={() => onPriorityChange(task.id, nextPriority(task.priority))}
                    className="self-start text-tg-sm text-tg-accent-text"
                  >
                    Приоритет: {PRIORITY_LABEL[task.priority]}
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-none flex-wrap items-center gap-2 border-t border-tg-divider px-3 py-2.5">
                {task.status === 'inbox' ? (
                  <>
                    <TgButton
                      onClick={() => { onDone(task.id); onClose() }}
                      disabled={loadingId === task.id}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Выполнено
                    </TgButton>
                    <TgButton
                      variant="light"
                      onClick={(e) => setSnoozeAnchor({ x: e.clientX, y: e.clientY })}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Отложить
                    </TgButton>
                    <TgButton
                      variant="attention"
                      onClick={() => { onDismiss(task.id); onClose() }}
                    >
                      Убрать
                    </TgButton>
                  </>
                ) : (
                  <TgButton
                    variant="light"
                    onClick={() => { onReopen(task.id); onClose() }}
                    disabled={loadingId === task.id}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {task.status === 'done' ? 'Вернуть в inbox' : 'В inbox'}
                  </TgButton>
                )}

                <TgButton
                  variant="light"
                  className={cn('ml-auto')}
                  onClick={() => window.electronAPI?.openExternal(links.deep)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  В Telegram
                </TgButton>
              </div>
            </motion.div>

            <TgPopupMenu
              open={snoozeAnchor !== null}
              anchor={snoozeAnchor}
              onClose={() => setSnoozeAnchor(null)}
              items={snoozeItems}
            />
          </>
        )
      })()}
    </AnimatePresence>,
    document.body,
  )
}
```

- [ ] **Step 2: Check types and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tasks/TaskDetailModal.tsx
git commit -m "refactor: rebuild the task window on the kit

Same information, Telegram shapes: the author gets an avatar and the meta
line collapses into one row under the name. Formatting now comes from the
shared module instead of a second copy of the same functions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Stage check

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run every automated check**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
npx tsc -b
npm run build
```

Expected: 30 tests pass, no type errors, build succeeds.

- [ ] **Step 2: Confirm the old palette is gone from the task files**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rnE "indigo|amber|emerald|slate|bg-card|text-muted-foreground" src/components/tasks
```

Expected: no output.

- [ ] **Step 3: Start the app**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
env -u ELECTRON_RUN_AS_NODE npm run dev
```

The `env -u` prefix matters: `ELECTRON_RUN_AS_NODE=1` in the agent shell makes electron start as plain Node and no window appears.

- [ ] **Step 4: Walk the inventory**

Open `docs/superpowers/specs/2026-09-14-stage-2-inventory.md` and check every line of it against the running app. The items most likely to have been lost in the rewrite:

1. Right-click a row: the menu opens at the pointer, and near the bottom edge it opens upward.
2. Menu items: Подробности, Открыть в Telegram, Приоритет, Закрепить, Убрать из списка. On Done and Snoozed instead: Вернуть or В inbox.
3. Выполнено completes the task; the row turns into the undo strip and the bar drains over five seconds.
4. The caret next to Выполнено opens the reply field; Enter sends, Escape closes.
5. Отложить offers 1 час, 3 часа, Завтра утром.
6. В работу sets the eye mark, pressing it again removes it.
7. Убрать из списка hides the row and the toast appears at the bottom with Отменить.
8. Search filters, Escape in the field clears it, the cross clears it.
9. On Done: Очистить все asks for confirmation.
10. Drag a row by the handle that appears on hover; a pinned row cannot be dragged.
11. Ctrl+D, Ctrl+Z, Ctrl+F, arrows still work, and the selected row is visibly outlined.
12. At 340px width nothing overflows sideways.

- [ ] **Step 5: Commit any fixes, then report**

If the walk found nothing, there is nothing to commit and the stage is done. If it found problems, fix them, re-run Step 1, and commit with a `fix:` message naming what was lost and restored.

---

## What stays for later stages

Stage 3 rewrites the settings screen and the chat picker. Stage 4 covers statistics, auth, PIN and the update dialog, and deletes `SetupWizard`. Stage 5 removes `AnimatedGradientBg`, `ThemeToggler` and the shadcn colour aliases from the Tailwind config, and adds the high-contrast switch to settings.
