# Telegram Redesign, Stage 5 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the redesign: remove the last shadcn colour names, and give the user the high-contrast mode the spec promised.

**Architecture:** Three small steps. The error screen is the only file still using the old colour names, so it moves to `tg-` classes and the nine aliases leave the Tailwind config. The high-contrast palette already exists in `tg-palette.css` under `.tg-hc`; all that is missing is a hook that flips the class on the root element and a row in the settings screen.

**Tech Stack:** React 18, TypeScript 5.5, Tailwind 3.4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-telegram-redesign-design.md`

No behaviour inventory this stage: nothing is being rewritten. Two files change colour, one setting is added.

## Global Constraints

- Work continues on branch `redesign/telegram`. The app must start after every task.
- Do not modify `src/api/*`, `src/types/*`, or anything under `services/`.
- Every colour comes from a `--tg-*` token via a `tg-` Tailwind class.
- Minimum font size 12px (`text-tg-sm`).
- Russian strings are preserved exactly.
- Run `npx tsc -b` and `npm test` before every commit.
- Commit messages: English, imperative, prefixed, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Task 1: The last screen, and the aliases go

**Files:**
- Modify: `apps/desktop/src/components/ui/ErrorBoundary.tsx`
- Modify: `apps/desktop/tailwind.config.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the Tailwind theme no longer defines `background`, `foreground`, `card`, `primary`, `muted`, `accent`, `border`, `input` or `ring`.

- [ ] **Step 1: Recolour the error screen**

In `apps/desktop/src/components/ui/ErrorBoundary.tsx`, replace the fallback markup (the `return (` block inside `render`) with:

```tsx
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-tg-bg px-6 text-center">
          <p className="text-3xl">💥</p>
          <p className="text-tg-box font-semibold text-tg-text-bold">Что-то пошло не так</p>
          <p className="max-w-xs text-tg-sm leading-relaxed text-tg-text-sub">
            {this.state.error?.message ?? 'Неизвестная ошибка рендеринга'}
          </p>
          <button
            onClick={this.handleReload}
            className="mt-2 rounded-tg-btn border border-tg-divider px-4 py-1.5 text-tg-sm text-tg-text-sub transition-colors duration-tg-universal hover:bg-tg-bg-over hover:text-tg-text"
          >
            Попробовать снова
          </button>
        </div>
```

- [ ] **Step 2: Confirm nothing else uses the aliases**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rnoE "\b(bg|text|border|ring|divide|outline|placeholder|caret|fill|stroke)-(background|foreground|card|primary|muted|accent|border|input|ring)(-foreground)?\b" src --include=*.tsx --include=*.ts
```

Expected: no output. `border-tg-divider` and similar are unaffected; the pattern only matches the bare alias names.

- [ ] **Step 3: Delete the aliases from the Tailwind config**

In `apps/desktop/tailwind.config.ts`, delete the whole block of old shadcn names from `background` down to `ring`, together with the comment above it, leaving the `tg` scale as the only entry under `colors`.

- [ ] **Step 4: Check and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
npm run build
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/ui/ErrorBoundary.tsx apps/desktop/tailwind.config.ts
git commit -m "refactor: drop the shadcn colour names

They were kept through the redesign so screens that had not been rewritten
yet still picked up Telegram colours. The error screen was the last file
using them, so both it and the aliases go, and the tg scale is now the
only colour source.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: High-contrast mode

**Files:**
- Create: `apps/desktop/src/hooks/useHighContrast.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/settings/sections/AppearanceSection.tsx`

**Interfaces:**
- Consumes: the `.tg-hc` palette block already in `src/styles/tg-palette.css`.
- Produces: `useHighContrast(): { enabled: boolean; toggle: () => void }` — reads the saved choice, applies the `tg-hc` class to `<html>`, and remembers changes.

- [ ] **Step 1: Write the hook**

Create `apps/desktop/src/hooks/useHighContrast.ts`:

```ts
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tg-high-contrast'

/**
 * High contrast mode.
 *
 * The Telegram palette fails WCAG AA on most text pairs — white on the day
 * accent is 2.67 against a 4.5 threshold. The corrected values live in
 * tg-palette.css under .tg-hc; this hook only decides whether that class is
 * on the root element.
 */
export function useHighContrast() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('tg-hc', enabled)
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      // private mode or blocked storage — the class still applies this session
    }
  }, [enabled])

  return { enabled, toggle: () => setEnabled((v) => !v) }
}
```

- [ ] **Step 2: Apply it at the root**

In `apps/desktop/src/App.tsx`, add the import and call it next to `useTheme`, so the class is applied on every screen including the PIN gate:

```tsx
import { useHighContrast } from '@/hooks/useHighContrast'
```

and inside the component, directly under `useTheme()`:

```tsx
  useHighContrast()
```

- [ ] **Step 3: Add the setting**

In `apps/desktop/src/components/settings/sections/AppearanceSection.tsx`, add the import:

```tsx
import { useHighContrast } from '@/hooks/useHighContrast'
```

then, inside the component and before the `return`, read the hook:

```tsx
  const highContrast = useHighContrast()
```

and add this row as the last child of `TgSection`, after the display-mode row:

```tsx
      <TgSettingRow
        label="Повышенная контрастность"
        hint="Тёмный текст и плашки для лучшей читаемости"
      >
        <TgToggle
          checked={highContrast.enabled}
          onChange={highContrast.toggle}
          label="Повышенная контрастность"
        />
      </TgSettingRow>
```

`TgToggle` calls `onChange` with the next value; `toggle` ignores its argument and flips the stored one, which is the same thing for a two-state switch.

- [ ] **Step 4: Check and commit**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm test
npm run build
cd D:/Telegram-Task-Filter
git add apps/desktop/src/hooks/useHighContrast.ts apps/desktop/src/App.tsx apps/desktop/src/components/settings/sections/AppearanceSection.tsx
git commit -m "feat: add the high-contrast mode

The Telegram palette fails WCAG AA on fourteen of seventeen key text
pairs; white on the day accent is 2.67 against a 4.5 threshold. The
corrected values were generated back in stage 0 and have been sitting in
the stylesheet since. This switches them on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Final check

- [ ] **Step 1: Run everything**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
npx tsc -b
npm run build
```

Expected: 53 tests pass, no type errors, build succeeds.

- [ ] **Step 2: The redesign completion check**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rnE "indigo|amber|emerald|slate|bg-background|text-muted-foreground|bg-card|rounded-xl" src --include=*.tsx
```

Expected: no output. Anything that matches is a leftover and must be fixed before the stage is called done.

- [ ] **Step 3: Start the app and check the two visible things**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
env -u ELECTRON_RUN_AS_NODE npm run dev
```

1. The app looks unchanged from stage 4 — the alias removal must be invisible.
2. Settings, «Внешний вид»: the new row is last, and turning it on darkens the secondary text and the accent everywhere at once.

- [ ] **Step 4: Update the spec status**

In `docs/superpowers/specs/2026-09-13-telegram-redesign-design.md`, change the status line to record that all five stages are done on the branch, and commit that with a `docs:` message.
