# Telegram Redesign, Stages 0 and 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Telegram Desktop palette, metrics and motion into the app as a token system and a small UI kit, then rebuild the window shell (title bar, tabs, sliding panels, top bar) on top of it.

**Architecture:** Colour and motion live in CSS custom properties generated from Telegram Desktop sources. Tailwind maps both the new `tg-*` utilities and the existing shadcn colour names onto those properties, so screens that have not been rewritten yet change colour without being touched. A new `src/components/tg/` folder holds presentational primitives (ripple, button, row, toggle, badge, title bar, tabs, sliding panel) that know nothing about tasks or settings. Business logic stays in `src/hooks`, `src/api` and `src/lib` and is not modified.

**Tech Stack:** React 18, TypeScript 5.5, Tailwind 3.4, framer-motion 11, Electron 40, Vite 5, Vitest (added by this plan).

**Spec:** `docs/superpowers/specs/2026-09-13-telegram-redesign-design.md`

## Global Constraints

- All work happens on branch `redesign/telegram`. The app must start after every task.
- Do not modify `src/hooks/*`, `src/api/*`, `src/lib/date.ts`, `src/lib/text.ts`, `src/lib/sound.ts`, `src/lib/log-parser.ts`, `src/types/*`, or anything under `services/`. New files in `src/lib/` are allowed.
- **Another session is committing to this repository at the same time.** It has been working on the backend and on `apps/desktop/electron/main.ts`, and it leaves files modified in the working tree. Never run `git add -A` at the repository root and never stage a file a task does not name. Before starting, run `git log --oneline -5` and `git status --short` to see what it has done since this plan was written.
- Line numbers quoted in this plan were verified against commit `4f53122`. If the other session has since edited `electron/main.ts`, locate the code by the surrounding text rather than by number.
- Every colour comes from a `--tg-*` custom property. Never write a hex value or a Tailwind palette class such as `bg-indigo-500` in new code.
- Minimum font size in the interface is 12 px. Telegram's base size is 13 px, dialogs use 14 px.
- Animation durations come from `src/lib/tg-motion.ts`. Never write a duration literal in a component.
- Radius values: 4 px buttons, 8 px menus and modals, 3 px and 6 px small plates. Never `rounded-xl`.
- All user-visible strings are Russian and must be preserved exactly as they appear in the file being replaced.
- Run `npx tsc -b` before every commit. It must report no errors.
- Commit messages: English, imperative, `feat:` / `fix:` / `refactor:` / `chore:` prefix, and end with the line `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

Created:

| File | Responsibility |
|---|---|
| `apps/desktop/vitest.config.ts` | Test runner config, path alias only |
| `apps/desktop/src/styles/tg-palette.css` | Generated Telegram tokens, day and night |
| `apps/desktop/src/lib/tg-motion.ts` | Animation durations as named constants |
| `apps/desktop/src/lib/peer-color.ts` | Maps a chat id to one of Telegram's eight author colours |
| `apps/desktop/src/lib/peer-color.test.ts` | Tests for the above |
| `apps/desktop/src/components/tg/ripple-geometry.ts` | Pure maths for the ripple circle |
| `apps/desktop/src/components/tg/ripple-geometry.test.ts` | Tests for the above |
| `apps/desktop/src/components/tg/useRipple.ts` | Hook that attaches ripple elements on pointer down |
| `apps/desktop/src/components/tg/TgButton.tsx` | Telegram button, three variants |
| `apps/desktop/src/components/tg/TgIconButton.tsx` | Round icon button |
| `apps/desktop/src/components/tg/TgRow.tsx` | List row with hover, ripple and selected state |
| `apps/desktop/src/components/tg/TgToggle.tsx` | Telegram switch |
| `apps/desktop/src/components/tg/TgBadge.tsx` | Unread-style counter |
| `apps/desktop/src/components/tg/TgTitleBar.tsx` | 24 px window strip with three buttons |
| `apps/desktop/src/components/tg/TgWindowFrame.tsx` | Title bar plus page content, used by every screen |
| `apps/desktop/src/components/tg/TgTabs.tsx` | Underlined tabs |
| `apps/desktop/src/components/tg/TgSlidePanel.tsx` | Panel that slides in from the right |
| `apps/desktop/src/components/tg/index.ts` | Re-exports |

Modified:

| File | Change |
|---|---|
| `apps/desktop/package.json` | Add Vitest dev dependency and `test` script |
| `apps/desktop/src/index.css` | Import palette, base typography, scrollbar, reduced motion |
| `apps/desktop/tailwind.config.ts` | `tg-*` colours, radii, durations; remap shadcn names onto Telegram tokens |
| `apps/desktop/electron/main.ts` | Window background follows the theme |
| `apps/desktop/electron/preload.ts` | `setTheme` bridge |
| `apps/desktop/src/electron.d.ts` | Type for `setTheme` |
| `apps/desktop/src/hooks/useTheme.ts` | Exception to the "do not touch hooks" rule: one line that notifies Electron |
| `apps/desktop/src/components/layout/AppShell.tsx` | Window frame, sliding panels, shortcuts disabled under panels |
| `apps/desktop/src/components/layout/TopBar.tsx` | Rebuilt on the kit, no reserved 120 px |
| `apps/desktop/src/components/layout/FilterTabs.tsx` | Rebuilt on `TgTabs` |
| `apps/desktop/src/components/auth/PinScreen.tsx` | Window frame instead of fixed controls |
| `apps/desktop/src/components/settings/SettingsScreen.tsx` | Remove the 120 px cutout only |
| `apps/desktop/src/components/stats/StatsScreen.tsx` | Remove the 120 px cutout only |

Deleted at the end of Stage 1:

| File | Why |
|---|---|
| `apps/desktop/src/components/ui/WindowControls.tsx` | Replaced by `TgTitleBar` |

`AnimatedGradientBg.tsx`, `ThemeToggler.tsx` and `SetupWizard.tsx` are deleted in later stages, once the screens that import them are rewritten.

---

## Task 1: Branch, test runner, and the generated palette

**Files:**
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/styles/tg-palette.css`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs Vitest; CSS custom properties `--tg-*` are defined on `:root, .light` and `.dark`. Every later task reads those properties.

- [ ] **Step 1: Create the branch**

```bash
cd D:/Telegram-Task-Filter
git checkout -b redesign/telegram
git status --short
```

Expected: the two backend files still show as modified and untracked. Leave them alone.

- [ ] **Step 2: Add Vitest**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm install -D vitest@^2.1.0
```

- [ ] **Step 3: Add the test script**

In `apps/desktop/package.json`, inside `"scripts"`, after the `"preview"` line, add:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Create the Vitest config**

Create `apps/desktop/vitest.config.ts`. It deliberately does not reuse `vite.config.ts`: that file starts the Electron plugin, which has no place in a unit test run.

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Create the palette file**

Create `apps/desktop/src/styles/tg-palette.css` with exactly this content. The values were extracted from Telegram Desktop sources; do not adjust them by eye.

```css
/* Generated from Telegram Desktop sources. Do not edit by hand.
   day:   desktop-app/lib_ui  ui/colors.palette
   night: telegramdesktop/tdesktop  Telegram/Resources/night.tdesktop-theme
   Channels are stored as "R G B" so Tailwind can apply alpha modifiers.
   Tokens whose transparency is baked into the Telegram palette are rgba(). */

:root, .light {
  --tg-bg: 255 255 255;
  --tg-bg-over: 241 241 241;
  --tg-bg-ripple: 229 229 229;
  --tg-text: 0 0 0;
  --tg-text-bold: 34 34 34;
  --tg-text-sub: 153 153 153;
  --tg-text-sub-over: 145 145 145;
  --tg-accent: 64 167 227;
  --tg-accent-text: 22 138 205;
  --tg-on-accent: 255 255 255;
  --tg-divider: 224 224 224;
  --tg-row-bg-over: 241 241 241;
  --tg-row-ripple: 229 229 229;
  --tg-row-active-bg: 65 159 217;
  --tg-row-active-text: 255 255 255;
  --tg-row-active-ripple: 32 149 208;
  --tg-row-name: 34 34 34;
  --tg-row-text: 153 153 153;
  --tg-row-date: 153 153 153;
  --tg-badge-bg: 64 167 227;
  --tg-badge-bg-muted: 187 187 187;
  --tg-badge-text: 255 255 255;
  --tg-btn-bg: 64 167 227;
  --tg-btn-bg-over: 57 165 219;
  --tg-btn-ripple: 32 149 208;
  --tg-btn-light-bg-over: 227 241 250;
  --tg-btn-light-ripple: 201 228 246;
  --tg-btn-light-text: 22 138 205;
  --tg-danger: 209 78 78;
  --tg-menu-bg: 255 255 255;
  --tg-menu-icon: 153 153 153;
  --tg-menu-separator: 241 241 241;
  --tg-menu-disabled: 204 204 204;
  --tg-box-bg: 255 255 255;
  --tg-box-title: 64 64 64;
  --tg-box-good: 74 180 74;
  --tg-box-error: 216 77 77;
  --tg-placeholder: 153 153 153;
  --tg-line-active: 55 161 222;
  --tg-line-error: 228 131 131;
  --tg-checkbox-off: 179 179 179;
  --tg-tooltip-bg: 238 242 245;
  --tg-tooltip-text: 93 108 128;
  --tg-title-bg: 241 241 241;
  --tg-title-text: 62 60 62;
  --tg-title-btn: 171 171 171;
  --tg-title-btn-over-bg: 229 229 229;
  --tg-title-btn-over: 154 154 154;
  --tg-title-close-over-bg: 232 17 35;
  --tg-search-bg: 241 241 241;
  --tg-layer: rgba(0, 0, 0, 0.498);
  --tg-shadow: rgba(0, 0, 0, 0.094);
  --tg-scroll-thumb: rgba(0, 0, 0, 0.325);
  --tg-scroll-thumb-over: rgba(0, 0, 0, 0.478);
  --tg-scroll-track: rgba(0, 0, 0, 0.102);
  --tg-danger-bg-over: rgb(252, 223, 222);
  --tg-danger-ripple: rgb(244, 195, 194);
  --tg-peer-1: 192 61 51;
  --tg-peer-2: 79 173 45;
  --tg-peer-3: 208 147 6;
  --tg-peer-4: 22 138 205;
  --tg-peer-5: 133 68 214;
  --tg-peer-6: 205 64 115;
  --tg-peer-7: 41 150 173;
  --tg-peer-8: 206 103 27;
  --tg-window-bg-hex: #ffffff;
}

.dark {
  --tg-bg: 23 33 43;
  --tg-bg-over: 35 46 60;
  --tg-bg-ripple: 36 48 61;
  --tg-text: 245 245 245;
  --tg-text-bold: 233 232 232;
  --tg-text-sub: 112 132 153;
  --tg-text-sub-over: 124 144 164;
  --tg-accent: 82 136 193;
  --tg-accent-text: 106 179 243;
  --tg-on-accent: 255 255 255;
  --tg-divider: 49 60 73;
  --tg-row-bg-over: 32 43 54;
  --tg-row-ripple: 37 49 61;
  --tg-row-active-bg: 43 82 120;
  --tg-row-active-text: 255 255 255;
  --tg-row-active-ripple: 49 90 128;
  --tg-row-name: 245 245 245;
  --tg-row-text: 127 145 164;
  --tg-row-date: 134 150 168;
  --tg-badge-bg: 64 130 188;
  --tg-badge-bg-muted: 62 84 106;
  --tg-badge-text: 255 255 255;
  --tg-btn-bg: 47 110 165;
  --tg-btn-bg-over: 52 118 171;
  --tg-btn-ripple: 59 124 177;
  --tg-btn-light-bg-over: 29 42 57;
  --tg-btn-light-ripple: 34 49 67;
  --tg-btn-light-text: 106 178 242;
  --tg-danger: 236 57 66;
  --tg-menu-bg: 23 33 43;
  --tg-menu-icon: 108 120 131;
  --tg-menu-separator: 35 47 57;
  --tg-menu-disabled: 61 78 92;
  --tg-box-bg: 23 33 43;
  --tg-box-title: 235 235 235;
  --tg-box-good: 85 152 219;
  --tg-box-error: 220 61 61;
  --tg-placeholder: 109 120 131;
  --tg-line-active: 99 150 203;
  --tg-line-error: 239 89 89;
  --tg-checkbox-off: 79 98 118;
  --tg-tooltip-bg: 22 34 45;
  --tg-tooltip-text: 212 224 234;
  --tg-title-bg: 36 47 61;
  --tg-title-text: 145 163 179;
  --tg-title-btn: 87 102 115;
  --tg-title-btn-over-bg: 37 48 62;
  --tg-title-btn-over: 224 224 224;
  --tg-title-close-over-bg: 233 37 57;
  --tg-search-bg: 36 47 61;
  --tg-layer: rgba(0, 0, 0, 0.498);
  --tg-shadow: rgba(4, 8, 14, 0.337);
  --tg-scroll-thumb: rgba(255, 255, 255, 0.325);
  --tg-scroll-thumb-over: rgba(255, 255, 255, 0.478);
  --tg-scroll-track: rgba(255, 255, 255, 0.102);
  --tg-danger-bg-over: rgba(89, 42, 42, 0.392);
  --tg-danger-ripple: rgba(104, 50, 50, 0.392);
  --tg-peer-1: 251 97 105;
  --tg-peer-2: 133 222 133;
  --tg-peer-3: 243 188 92;
  --tg-peer-4: 101 189 243;
  --tg-peer-5: 180 139 242;
  --tg-peer-6: 255 86 148;
  --tg-peer-7: 98 212 227;
  --tg-peer-8: 250 163 87;
  --tg-window-bg-hex: #17212b;
}

/* High contrast. Only the tokens that failed WCAG AA are redefined;
   values keep the original hue and move lightness until the ratio is 4.5. */
.tg-hc:root, :root.tg-hc, .tg-hc.light {
  --tg-text-sub: 118 118 118;
  --tg-row-text: 118 118 118;
  --tg-row-date: 118 118 118;
  --tg-placeholder: 118 118 118;
  --tg-title-btn: 110 110 110;
  --tg-accent: 27 125 183;
  --tg-btn-bg: 27 125 183;
  --tg-badge-bg: 27 125 183;
  --tg-badge-bg-muted: 118 118 118;
  --tg-row-active-bg: 36 125 180;
  --tg-danger: 207 71 71;
  --tg-btn-light-text: 20 125 185;
}

.tg-hc.dark {
  --tg-text-sub: 117 137 157;
  --tg-placeholder: 125 136 146;
  --tg-title-btn: 135 151 164;
  --tg-accent: 65 121 181;
  --tg-badge-bg: 60 123 178;
  --tg-danger: 238 76 84;
}
```

- [ ] **Step 6: Verify the test runner starts**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: Vitest runs and reports "No test files found". That is success for this step; the file it will find is written in Task 3.

- [ ] **Step 7: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/vitest.config.ts apps/desktop/src/styles/tg-palette.css
git commit -m "chore: add vitest and the generated Telegram palette

Palette values are extracted from Telegram Desktop sources rather than
picked by eye: colors.palette for day, night.tdesktop-theme for night.
Channels are stored as R G B triples so Tailwind alpha modifiers work.

The high-contrast block redefines only the tokens that fail WCAG AA;
each replacement keeps the original hue and reaches a ratio of 4.5.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Tailwind reads Telegram tokens

**Files:**
- Modify: `apps/desktop/tailwind.config.ts`
- Modify: `apps/desktop/src/index.css`

**Interfaces:**
- Consumes: `--tg-*` properties from Task 1.
- Produces: Tailwind utilities `bg-tg-bg`, `text-tg-text-sub`, `border-tg-divider`, `rounded-tg-btn`, `duration-tg-universal` and the rest; and the existing shadcn names (`bg-background`, `text-muted-foreground`, `border-border`) now resolve to Telegram colours, which is what repaints screens that have not been rewritten.

- [ ] **Step 1: Replace the colour and radius sections of the Tailwind config**

In `apps/desktop/tailwind.config.ts`, replace the whole `theme.extend` object with this. The `colors` block does two jobs: it defines the `tg` scale for new code, and it re-points the old shadcn names at Telegram tokens so untouched screens change colour for free.

```ts
    extend: {
      colors: {
        // Old shadcn names, now fed by Telegram tokens. They exist so the
        // screens not yet rewritten pick up the new palette. Delete this
        // block once no `bg-background` style class remains in src.
        background: 'rgb(var(--tg-bg) / <alpha-value>)',
        foreground: 'rgb(var(--tg-text) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--tg-bg) / <alpha-value>)',
          foreground: 'rgb(var(--tg-text) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--tg-accent) / <alpha-value>)',
          foreground: 'rgb(var(--tg-on-accent) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--tg-bg-over) / <alpha-value>)',
          foreground: 'rgb(var(--tg-text-sub) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--tg-bg-over) / <alpha-value>)',
          foreground: 'rgb(var(--tg-text-bold) / <alpha-value>)',
        },
        border: 'rgb(var(--tg-divider) / <alpha-value>)',
        input: 'rgb(var(--tg-divider) / <alpha-value>)',
        ring: 'rgb(var(--tg-accent) / <alpha-value>)',

        // Telegram scale for new code.
        tg: {
          bg: 'rgb(var(--tg-bg) / <alpha-value>)',
          'bg-over': 'rgb(var(--tg-bg-over) / <alpha-value>)',
          'bg-ripple': 'rgb(var(--tg-bg-ripple) / <alpha-value>)',
          text: 'rgb(var(--tg-text) / <alpha-value>)',
          'text-bold': 'rgb(var(--tg-text-bold) / <alpha-value>)',
          'text-sub': 'rgb(var(--tg-text-sub) / <alpha-value>)',
          accent: 'rgb(var(--tg-accent) / <alpha-value>)',
          'accent-text': 'rgb(var(--tg-accent-text) / <alpha-value>)',
          'on-accent': 'rgb(var(--tg-on-accent) / <alpha-value>)',
          divider: 'rgb(var(--tg-divider) / <alpha-value>)',
          'row-over': 'rgb(var(--tg-row-bg-over) / <alpha-value>)',
          'row-ripple': 'rgb(var(--tg-row-ripple) / <alpha-value>)',
          'row-active': 'rgb(var(--tg-row-active-bg) / <alpha-value>)',
          'row-active-text': 'rgb(var(--tg-row-active-text) / <alpha-value>)',
          'row-name': 'rgb(var(--tg-row-name) / <alpha-value>)',
          'row-text': 'rgb(var(--tg-row-text) / <alpha-value>)',
          'row-date': 'rgb(var(--tg-row-date) / <alpha-value>)',
          badge: 'rgb(var(--tg-badge-bg) / <alpha-value>)',
          'badge-muted': 'rgb(var(--tg-badge-bg-muted) / <alpha-value>)',
          'badge-text': 'rgb(var(--tg-badge-text) / <alpha-value>)',
          btn: 'rgb(var(--tg-btn-bg) / <alpha-value>)',
          'btn-over': 'rgb(var(--tg-btn-bg-over) / <alpha-value>)',
          'btn-ripple': 'rgb(var(--tg-btn-ripple) / <alpha-value>)',
          'btn-light-over': 'rgb(var(--tg-btn-light-bg-over) / <alpha-value>)',
          'btn-light-ripple': 'rgb(var(--tg-btn-light-ripple) / <alpha-value>)',
          'btn-light-text': 'rgb(var(--tg-btn-light-text) / <alpha-value>)',
          danger: 'rgb(var(--tg-danger) / <alpha-value>)',
          'menu-bg': 'rgb(var(--tg-menu-bg) / <alpha-value>)',
          'menu-icon': 'rgb(var(--tg-menu-icon) / <alpha-value>)',
          'menu-separator': 'rgb(var(--tg-menu-separator) / <alpha-value>)',
          'menu-disabled': 'rgb(var(--tg-menu-disabled) / <alpha-value>)',
          'box-bg': 'rgb(var(--tg-box-bg) / <alpha-value>)',
          'box-title': 'rgb(var(--tg-box-title) / <alpha-value>)',
          good: 'rgb(var(--tg-box-good) / <alpha-value>)',
          error: 'rgb(var(--tg-box-error) / <alpha-value>)',
          placeholder: 'rgb(var(--tg-placeholder) / <alpha-value>)',
          'line-active': 'rgb(var(--tg-line-active) / <alpha-value>)',
          'line-error': 'rgb(var(--tg-line-error) / <alpha-value>)',
          'checkbox-off': 'rgb(var(--tg-checkbox-off) / <alpha-value>)',
          'tooltip-bg': 'rgb(var(--tg-tooltip-bg) / <alpha-value>)',
          'tooltip-text': 'rgb(var(--tg-tooltip-text) / <alpha-value>)',
          'title-bg': 'rgb(var(--tg-title-bg) / <alpha-value>)',
          'title-text': 'rgb(var(--tg-title-text) / <alpha-value>)',
          'title-btn': 'rgb(var(--tg-title-btn) / <alpha-value>)',
          'title-btn-over-bg': 'rgb(var(--tg-title-btn-over-bg) / <alpha-value>)',
          'title-btn-over': 'rgb(var(--tg-title-btn-over) / <alpha-value>)',
          'title-close-over': 'rgb(var(--tg-title-close-over-bg) / <alpha-value>)',
          search: 'rgb(var(--tg-search-bg) / <alpha-value>)',
        },
      },
      borderRadius: {
        // Telegram: buttons 4, menus and boxes 8, small plates 3 and 6.
        'tg-btn': '4px',
        'tg-box': '8px',
        'tg-sm': '3px',
        'tg-md': '6px',
      },
      fontSize: {
        // Telegram: base 13, dialogs 14, smallest allowed here 12.
        'tg-sm': ['12px', '16px'],
        'tg-base': ['13px', '18px'],
        'tg-box': ['14px', '20px'],
      },
      transitionDuration: {
        'tg-universal': '120ms',
        'tg-menu': '150ms',
        'tg-tabs': '150ms',
        'tg-slide': '240ms',
        'tg-fade': '200ms',
      },
      spacing: {
        'tg-title': '24px',
      },
    },
```

Two deliberate losses in that replacement, both checked before writing this plan:

- The old `borderRadius` entries `lg`, `md` and `sm` fed from `--radius` are gone, so existing `rounded-lg` and `rounded-xl` classes fall back to Tailwind's own values. Those classes only appear on screens that later stages rewrite, and Telegram is squarer anyway.
- The `gradient-shift`, `fade-in` and `slide-up` keyframes are gone. A search over `src` shows no `animate-fade-in`, `animate-slide-up` or `animate-gradient-shift` class anywhere, so nothing referenced them.

- [ ] **Step 2: Rewrite `src/index.css`**

Replace the whole file. The old shadcn variable block goes: the names now come from Tailwind, which reads `--tg-*` directly. The scrollbar takes Telegram's width of 10 px and radius of 2 px, and reduced motion is honoured, which the project did not do anywhere.

```css
@import './styles/tg-palette.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-tg-divider;
  }

  html {
    color-scheme: light;
  }

  html.dark {
    color-scheme: dark;
  }

  body {
    @apply bg-tg-bg text-tg-text;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

/* Telegram scroll area: 10 px wide, 2 px radius, track stays quiet. */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--tg-scroll-thumb);
  border-radius: 2px;
  border: 3px solid transparent;
  background-clip: content-box;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--tg-scroll-thumb-over);
  background-clip: content-box;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Check the app still builds**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm run build
```

Expected: both finish with no errors.

- [ ] **Step 4: Look at the running app**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm run dev
```

Expected: the window opens in Telegram's night colours, `#17212b` background rather than the old near-black. Layout is still the old one, and the animated gradient blobs are still there. Both are fixed in later tasks. Stop the dev server before continuing.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/tailwind.config.ts apps/desktop/src/index.css
git commit -m "feat: point Tailwind at the Telegram palette

Adds a tg-* colour scale, Telegram radii, sizes and durations, and
re-points the existing shadcn colour names at the same tokens so screens
that have not been rewritten pick up the new palette without being
touched.

Also adds what the project never had: a prefers-reduced-motion rule and
a scrollbar matching Telegram's 10px width and 2px radius.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Motion constants and author colours

**Files:**
- Create: `apps/desktop/src/lib/tg-motion.ts`
- Create: `apps/desktop/src/lib/peer-color.ts`
- Test: `apps/desktop/src/lib/peer-color.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TG_MS`: object of durations in milliseconds, keys `universal`, `rippleIn`, `rippleOut`, `menuShow`, `menuHide`, `slide`, `fadeWrap`, `slideWrap`, `tabs`, `input`, `toastIn`, `toastSlide`, `toastOut`, `shake`, `scrollHide`.
  - `TG_PX`: object with `slideShift: 100`, `shakeShift: 4`, `titleHeight: 24`, `titleButtonWidth: 36`, `buttonHeight: 34`.
  - `peerColorIndex(chatId: string): number` returning 1 to 8 inclusive.
  - `peerColorVar(chatId: string): string` returning a CSS colour expression such as `rgb(var(--tg-peer-3))`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/lib/peer-color.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { peerColorIndex, peerColorVar } from './peer-color'

describe('peerColorIndex', () => {
  it('returns a value between 1 and 8 for any id', () => {
    const ids = ['-1001234567890', '42', '', 'abc', '-999999999999999']
    for (const id of ids) {
      const n = peerColorIndex(id)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(8)
      expect(Number.isInteger(n)).toBe(true)
    }
  })

  it('gives the same id the same colour every time', () => {
    expect(peerColorIndex('-1001234567890')).toBe(peerColorIndex('-1001234567890'))
  })

  it('spreads ids across more than one colour', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(peerColorIndex(`-100${i}`))
    expect(seen.size).toBeGreaterThan(4)
  })

  it('builds a css colour expression', () => {
    const css = peerColorVar('-1001234567890')
    expect(css).toMatch(/^rgb\(var\(--tg-peer-[1-8]\)\)$/)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: FAIL, "Failed to resolve import ./peer-color".

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/lib/peer-color.ts`:

```ts
/**
 * Telegram paints every chat participant in one of eight colours.
 * We do the same for task authors: same author, same colour, every launch.
 */

/** Number of author colours in the Telegram palette. */
const PEER_COLORS = 8

/**
 * Stable 1..8 colour slot for a chat id.
 *
 * A plain multiply-and-add hash: chat ids are short strings, and all we need
 * is that the same id lands on the same slot and that ids spread out.
 */
export function peerColorIndex(chatId: string): number {
  let hash = 0
  for (let i = 0; i < chatId.length; i++) {
    hash = (Math.imul(hash, 31) + chatId.charCodeAt(i)) >>> 0
  }
  return (hash % PEER_COLORS) + 1
}

/** The same slot as a CSS colour, ready for a style attribute. */
export function peerColorVar(chatId: string): string {
  return `rgb(var(--tg-peer-${peerColorIndex(chatId)}))`
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the motion constants**

Create `apps/desktop/src/lib/tg-motion.ts`:

```ts
/**
 * Animation timings copied from Telegram Desktop sources.
 *
 * basic.style:   universalDuration, slideDuration, slideShift, shake*
 * widgets.style: ripple, popup menu, toast, tabs, input, scroll area
 *
 * Components must read these rather than writing their own numbers, so a
 * timing can be checked against Telegram in one place.
 */
export const TG_MS = {
  /** Toggles, checkboxes, hover colour changes. */
  universal: 120,
  /** Ripple circle expanding from the press point. */
  rippleIn: 650,
  /** Ripple fading after release. */
  rippleOut: 200,
  /** Popup menu opening. */
  menuShow: 200,
  /** Popup menu closing. */
  menuHide: 150,
  /** Panel sliding in from the side. */
  slide: 240,
  /** Dimming behind a panel. */
  fadeWrap: 200,
  /** Block collapsing or expanding by height. */
  slideWrap: 150,
  /** Tab underline moving. */
  tabs: 150,
  /** Input underline and floating label. */
  input: 150,
  /** Toast appearing. */
  toastIn: 200,
  /** Toast sliding up. */
  toastSlide: 160,
  /** Toast fading away. */
  toastOut: 1000,
  /** Error shake. */
  shake: 300,
  /** Scrollbar hiding after scrolling stops. */
  scrollHide: 1000,
} as const

/** Distances and sizes from the same sources, in pixels. */
export const TG_PX = {
  /** How far a sliding panel travels. */
  slideShift: 100,
  /** Shake amplitude. */
  shakeShift: 4,
  /** Window title strip height. */
  titleHeight: 24,
  /** Window title button width. */
  titleButtonWidth: 36,
  /** Standard button height. */
  buttonHeight: 34,
} as const
```

- [ ] **Step 6: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/lib/tg-motion.ts apps/desktop/src/lib/peer-color.ts apps/desktop/src/lib/peer-color.test.ts
git commit -m "feat: add Telegram motion constants and author colours

Durations and distances are named constants so no component invents its
own timing. Author colours reproduce Telegram's eight-colour participant
scheme, keyed on chat id so an author keeps their colour across launches.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Ripple

**Files:**
- Create: `apps/desktop/src/components/tg/ripple-geometry.ts`
- Test: `apps/desktop/src/components/tg/ripple-geometry.test.ts`
- Create: `apps/desktop/src/components/tg/useRipple.ts`
- Modify: `apps/desktop/src/index.css`

**Interfaces:**
- Consumes: `TG_MS` from Task 3.
- Produces:
  - `rippleGeometry(width: number, height: number, x: number, y: number): { size: number; left: number; top: number }`.
  - `useRipple(): { onPointerDown: (e: React.PointerEvent<HTMLElement>) => void }` — spread onto any element that has `position: relative` and `overflow: hidden`.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/components/tg/ripple-geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rippleGeometry } from './ripple-geometry'

describe('rippleGeometry', () => {
  it('reaches the far corner when pressed in the centre', () => {
    const g = rippleGeometry(100, 100, 50, 50)
    // distance from centre to a corner of a 100x100 box
    expect(g.size).toBeCloseTo(Math.hypot(50, 50) * 2, 5)
    expect(g.left).toBeCloseTo(50 - Math.hypot(50, 50), 5)
    expect(g.top).toBeCloseTo(50 - Math.hypot(50, 50), 5)
  })

  it('reaches the opposite corner when pressed in a corner', () => {
    const g = rippleGeometry(100, 100, 0, 0)
    expect(g.size).toBeCloseTo(Math.hypot(100, 100) * 2, 5)
  })

  it('covers a wide row pressed near its right edge', () => {
    const g = rippleGeometry(400, 60, 390, 30)
    expect(g.size).toBeCloseTo(Math.hypot(390, 30) * 2, 5)
  })

  it('never returns a zero size', () => {
    const g = rippleGeometry(0, 0, 0, 0)
    expect(g.size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: FAIL, "Failed to resolve import ./ripple-geometry".

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/components/tg/ripple-geometry.ts`:

```ts
/**
 * Geometry of a Telegram ripple.
 *
 * The circle starts at the press point and has to reach the furthest corner
 * of the element, otherwise it stops short of a corner and looks clipped.
 */
export interface RippleGeometry {
  /** Diameter in pixels. */
  size: number
  /** Left offset relative to the element. */
  left: number
  /** Top offset relative to the element. */
  top: number
}

export function rippleGeometry(
  width: number,
  height: number,
  x: number,
  y: number,
): RippleGeometry {
  const radius = Math.max(
    Math.hypot(Math.max(x, width - x), Math.max(y, height - y)),
    1,
  )
  return { size: radius * 2, left: x - radius, top: y - radius }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
```

Expected: PASS, 8 tests in total across both files.

- [ ] **Step 5: Add the ripple styles**

Append to `apps/desktop/src/index.css`, after the scrollbar rules and before the reduced-motion block:

```css
/* Telegram ripple: the circle expands from the press point over 650ms and
   fades over 200ms once the pointer is released. Colour comes from the
   host element through --tg-ripple-color. */
.tg-ripple {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transform: scale(0);
  background: var(--tg-ripple-color, rgb(var(--tg-bg-ripple)));
  animation: tg-ripple-in 650ms cubic-bezier(0.24, 0.64, 0.32, 1) forwards;
}

.tg-ripple[data-released="true"] {
  animation:
    tg-ripple-in 650ms cubic-bezier(0.24, 0.64, 0.32, 1) forwards,
    tg-ripple-out 200ms linear forwards;
}

@keyframes tg-ripple-in {
  to { transform: scale(1); }
}

@keyframes tg-ripple-out {
  to { opacity: 0; }
}
```

- [ ] **Step 6: Write the hook**

Create `apps/desktop/src/components/tg/useRipple.ts`:

```ts
import { useCallback } from 'react'
import type React from 'react'
import { rippleGeometry } from './ripple-geometry'
import { TG_MS } from '@/lib/tg-motion'

/**
 * Telegram ripple as a hook.
 *
 * Spread the result onto an element that is `relative` and `overflow-hidden`.
 * The ripple element is created on press and removed after it has faded, so
 * nothing accumulates in the DOM.
 *
 * Colour is taken from the CSS custom property --tg-ripple-color on the
 * element, so a button and a list row can ripple in their own colours
 * without the hook knowing about either.
 */
export function useRipple() {
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const host = e.currentTarget
    const rect = host.getBoundingClientRect()
    const { size, left, top } = rippleGeometry(
      rect.width,
      rect.height,
      e.clientX - rect.left,
      e.clientY - rect.top,
    )

    const circle = document.createElement('span')
    circle.className = 'tg-ripple'
    circle.style.width = `${size}px`
    circle.style.height = `${size}px`
    circle.style.left = `${left}px`
    circle.style.top = `${top}px`
    host.appendChild(circle)

    let done = false
    const release = () => {
      if (done) return
      done = true
      circle.dataset.released = 'true'
      window.setTimeout(() => circle.remove(), TG_MS.rippleIn + TG_MS.rippleOut)
      host.removeEventListener('pointerup', release)
      host.removeEventListener('pointerleave', release)
      host.removeEventListener('pointercancel', release)
    }

    host.addEventListener('pointerup', release)
    host.addEventListener('pointerleave', release)
    host.addEventListener('pointercancel', release)
  }, [])

  return { onPointerDown }
}
```

- [ ] **Step 7: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/ripple-geometry.ts apps/desktop/src/components/tg/ripple-geometry.test.ts apps/desktop/src/components/tg/useRipple.ts apps/desktop/src/index.css
git commit -m "feat: add the Telegram ripple

The ripple is the most recognisable Telegram gesture and the app had none.
The circle starts at the press point and is sized to reach the furthest
corner, which is the part worth a test: a radius measured to the nearest
edge leaves a visible gap at the opposite corner.

Ripple colour comes from a custom property on the host element, so buttons
and list rows ripple in their own colours without the hook knowing them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Button, icon button, badge

**Files:**
- Create: `apps/desktop/src/components/tg/TgButton.tsx`
- Create: `apps/desktop/src/components/tg/TgIconButton.tsx`
- Create: `apps/desktop/src/components/tg/TgBadge.tsx`
- Create: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `useRipple` from Task 4, `cn` from `@/lib/utils`.
- Produces:
  - `<TgButton variant="active" | "light" | "attention" fullWidth? {...buttonProps}>` — height 34 px, radius 4 px, semibold 13 px.
  - `<TgIconButton label={string} size?: number {...buttonProps}>` — 30 px round button, `label` becomes both `title` and `aria-label`.
  - `<TgBadge count={number} muted?: boolean />` — renders nothing when `count` is 0.

- [ ] **Step 1: Write the button**

Create `apps/desktop/src/components/tg/TgButton.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

type Variant = 'active' | 'light' | 'attention'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** active: filled accent. light: quiet text button. attention: destructive. */
  variant?: Variant
  fullWidth?: boolean
  children: ReactNode
}

/** Telegram RoundButton: 34px tall, 4px radius, semibold label. */
const VARIANTS: Record<Variant, string> = {
  active:
    'bg-tg-btn text-tg-on-accent hover:bg-tg-btn-over [--tg-ripple-color:rgb(var(--tg-btn-ripple))]',
  light:
    'bg-transparent text-tg-btn-light-text hover:bg-tg-btn-light-over [--tg-ripple-color:rgb(var(--tg-btn-light-ripple))]',
  attention:
    'bg-transparent text-tg-danger hover:bg-[var(--tg-danger-bg-over)] [--tg-ripple-color:var(--tg-danger-ripple)]',
}

export function TgButton({
  variant = 'active',
  fullWidth = false,
  className,
  children,
  ...rest
}: Props) {
  const ripple = useRipple()

  return (
    <button
      {...rest}
      {...ripple}
      className={cn(
        'relative flex h-[34px] items-center justify-center gap-[7px] overflow-hidden',
        'rounded-tg-btn px-4 text-tg-base font-semibold',
        'transition-colors duration-tg-universal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tg-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 2: Write the icon button**

Create `apps/desktop/src/components/tg/TgIconButton.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** Used for both the tooltip and the accessible name. */
  label: string
  /** Button diameter in pixels. Telegram uses 30 in bars, 40 in menus. */
  size?: number
  children: ReactNode
}

export function TgIconButton({ label, size = 30, className, children, ...rest }: Props) {
  const ripple = useRipple()

  return (
    <button
      {...rest}
      {...ripple}
      title={label}
      aria-label={label}
      style={{ width: size, height: size, ...rest.style }}
      className={cn(
        'relative grid flex-none place-items-center overflow-hidden rounded-full',
        'text-tg-menu-icon hover:bg-tg-bg-over hover:text-tg-text-bold',
        'transition-colors duration-tg-universal',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tg-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 3: Write the badge**

Create `apps/desktop/src/components/tg/TgBadge.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface Props {
  count: number
  /** Muted grey, as Telegram shows counters for muted chats. */
  muted?: boolean
  className?: string
}

/** Telegram unread counter: pill shaped, tabular digits, hidden when empty. */
export function TgBadge({ count, muted = false, className }: Props) {
  if (count <= 0) return null

  return (
    <span
      className={cn(
        'inline-grid h-[18px] min-w-[18px] place-items-center rounded-[9px] px-[5px]',
        'text-[11px] font-semibold tabular-nums text-tg-badge-text',
        'transition-colors duration-tg-tabs',
        muted ? 'bg-tg-badge-muted' : 'bg-tg-badge',
        className,
      )}
    >
      {count > 999 ? '999+' : count}
    </span>
  )
}
```

- [ ] **Step 4: Write the re-export file**

Create `apps/desktop/src/components/tg/index.ts`:

```ts
export { useRipple } from './useRipple'
export { rippleGeometry } from './ripple-geometry'
export { TgButton } from './TgButton'
export { TgIconButton } from './TgIconButton'
export { TgBadge } from './TgBadge'
```

- [ ] **Step 5: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors. Nothing imports these yet; that happens in Task 8 onward.

- [ ] **Step 6: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgButton.tsx apps/desktop/src/components/tg/TgIconButton.tsx apps/desktop/src/components/tg/TgBadge.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add Telegram button, icon button and counter

Geometry follows widgets.style: 34px button height, 4px radius, semibold
13px label, 18px pill counter. Each variant sets its own ripple colour
through a custom property.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: List row and toggle

**Files:**
- Create: `apps/desktop/src/components/tg/TgRow.tsx`
- Create: `apps/desktop/src/components/tg/TgToggle.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `useRipple` from Task 4.
- Produces:
  - `<TgRow selected? onActivate? onContextMenu? className? children />` — a `div` with `role="button"`, keyboard activation on Enter and Space, hover and ripple in Telegram's row colours, and a 1 px divider below.
  - `<TgToggle checked onChange label />` — Telegram switch, 120 ms.

- [ ] **Step 1: Write the row**

Create `apps/desktop/src/components/tg/TgRow.tsx`:

```tsx
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'

interface Props {
  /** Selected row, as in Telegram's chat list: solid accent background. */
  selected?: boolean
  onActivate?: () => void
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void
  className?: string
  children: ReactNode
}

/**
 * A row of the Telegram list: no border, no radius, no card. Separation comes
 * from a one-pixel divider; feedback comes from hover and ripple.
 */
export function TgRow({ selected = false, onActivate, onContextMenu, className, children }: Props) {
  const ripple = useRipple()

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onActivate?.()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      {...ripple}
      className={cn(
        'relative cursor-pointer overflow-hidden border-b border-tg-divider',
        'transition-colors duration-tg-universal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tg-accent',
        selected
          ? 'bg-tg-row-active text-tg-row-active-text [--tg-ripple-color:rgb(var(--tg-row-active-ripple))]'
          : 'hover:bg-tg-row-over [--tg-ripple-color:rgb(var(--tg-row-ripple))]',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Write the toggle**

Create `apps/desktop/src/components/tg/TgToggle.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  /** Accessible name. Required: a switch with no name is unusable by screen reader. */
  label: string
  disabled?: boolean
  className?: string
}

/**
 * Telegram switch: an outlined track with a filled knob, 120ms.
 * Not the iOS pill, which is what the old Settings screen used.
 */
export function TgToggle({ checked, onChange, label, disabled = false, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-[34px] flex-none rounded-[10px] border-2 bg-transparent p-0',
        'transition-colors duration-tg-universal',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tg-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        checked ? 'border-tg-accent' : 'border-tg-checkbox-off',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-px top-px block h-3.5 w-3.5 rounded-full',
          'transition-[transform,background-color] duration-tg-universal ease-in-out',
          checked ? 'translate-x-[14px] bg-tg-accent' : 'translate-x-0 bg-tg-checkbox-off',
        )}
      />
    </button>
  )
}
```

- [ ] **Step 3: Extend the re-export file**

In `apps/desktop/src/components/tg/index.ts`, add two lines:

```ts
export { TgRow } from './TgRow'
export { TgToggle } from './TgToggle'
```

- [ ] **Step 4: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgRow.tsx apps/desktop/src/components/tg/TgToggle.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add Telegram list row and switch

The row is the shape the task card becomes: no card, no radius, a divider
and a ripple. It answers the keyboard, which the old card did not.

The switch is Telegram's outlined track with a filled knob at 120ms, not
the iOS pill the settings screen used.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Window background follows the theme

**Files:**
- Modify: `apps/desktop/electron/main.ts`
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/desktop/src/electron.d.ts`
- Modify: `apps/desktop/src/hooks/useTheme.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `window.electronAPI.setTheme(theme: 'dark' | 'light'): void`. The saved theme is stored beside the window bounds and used for `backgroundColor` at the next launch.

This is the one task that touches a hook, and only to add a notification line. Theme selection logic is unchanged.

- [ ] **Step 1: Extend the window state type**

`saveWindowState` currently writes only the bounds object, so a theme field written separately would be erased the next time the window moves. Fix the type first.

In `apps/desktop/electron/main.ts` line 20, replace:

```ts
interface WindowState { x: number; y: number; width: number; height: number }
```

with:

```ts
interface WindowState {
  x: number
  y: number
  width: number
  height: number
  /** Last theme the renderer reported, used for the window background at launch. */
  theme?: 'dark' | 'light'
}
```

- [ ] **Step 2: Make saving merge instead of overwrite**

Replace the existing `saveWindowState` function (around line 199) with:

```ts
function saveWindowState(): void {
  if (!win || win.isMinimized() || win.isMaximized()) return
  const bounds = win.getBounds()
  try {
    // Merge: the file also carries the theme, which must survive a move.
    const previous = readWindowState()
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ ...previous, ...bounds }),
      'utf-8',
    )
  } catch {
    // non-fatal
  }
}

/** Remembered theme, used for the window background before the page loads. */
function savedTheme(): 'dark' | 'light' {
  return readWindowState().theme === 'light' ? 'light' : 'dark'
}

/** Telegram window backgrounds: night #17212b, day #ffffff. */
function themeBackground(theme: 'dark' | 'light'): string {
  return theme === 'light' ? '#ffffff' : '#17212b'
}
```

- [ ] **Step 3: Use the saved theme for the window background**

In `createWindow`, replace the line

```ts
    backgroundColor: '#0f0f13',
```

with

```ts
    backgroundColor: themeBackground(savedTheme()),
```

- [ ] **Step 4: Handle theme changes from the page**

In `apps/desktop/electron/main.ts`, next to the other `ipcMain` handlers (near `ipcMain.handle('window:get-maximized', ...)`), add:

```ts
ipcMain.on('window:set-theme', (_event, theme: 'dark' | 'light') => {
  const next = theme === 'light' ? 'light' : 'dark'
  win?.setBackgroundColor(themeBackground(next))
  try {
    const previous = readWindowState()
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ ...previous, theme: next }),
      'utf-8',
    )
  } catch {
    // non-fatal
  }
})
```

- [ ] **Step 5: Expose it in the preload**

In `apps/desktop/electron/preload.ts`, inside the `exposeInMainWorld` object, after the `toggleMaximize` entry, add:

```ts
  /** Tell the main process which theme is active, so the window background matches */
  setTheme: (theme: 'dark' | 'light') => ipcRenderer.send('window:set-theme', theme),
```

- [ ] **Step 6: Add the type**

In `apps/desktop/src/electron.d.ts`, add to the `electronAPI` interface:

```ts
  setTheme: (theme: 'dark' | 'light') => void
```

- [ ] **Step 7: Notify from the theme hook**

In `apps/desktop/src/hooks/useTheme.ts`, inside the existing `useEffect`, after `localStorage.setItem('theme', theme)`, add one line:

```ts
    window.electronAPI?.setTheme(theme)
```

- [ ] **Step 8: Verify by switching themes**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm run dev
```

Switch the theme with the toggle in the top bar, then close and reopen the window. Expected: at launch the window frame is already the right colour, with no dark flash in light theme. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/electron/main.ts apps/desktop/electron/preload.ts apps/desktop/src/electron.d.ts apps/desktop/src/hooks/useTheme.ts
git commit -m "fix: paint the window in the active theme

backgroundColor was hardcoded to #0f0f13, so the light theme opened with
a dark flash and the dark theme did not match Telegram's #17212b. The
chosen theme is now stored beside the window bounds and applied before
the page loads.

saveWindowState now merges instead of overwriting, otherwise moving the
window would erase the stored theme.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Title bar and window frame

**Files:**
- Create: `apps/desktop/src/components/tg/TgTitleBar.tsx`
- Create: `apps/desktop/src/components/tg/TgWindowFrame.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `TgIconButton` from Task 5, `TG_PX` from Task 3.
- Produces:
  - `<TgTitleBar title={string} />` — 24 px strip, drag region, three 36×24 buttons, close menu with the two existing items.
  - `<TgWindowFrame title?={string} children />` — column layout: title bar on top, children filling the rest. Every screen renders inside one.

Behaviour that must survive from `WindowControls.tsx`: minimise, maximise and restore with the icon following state, a close menu with «Свернуть в трей» and «Закрыть полностью», the menu closing on outside click and on Escape, and the whole component rendering nothing outside Electron.

- [ ] **Step 1: Write the title bar**

Create `apps/desktop/src/components/tg/TgTitleBar.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TG_PX } from '@/lib/tg-motion'

interface Props {
  title?: string
}

/**
 * Telegram window strip: 24px tall, semibold 12px title, three 36x24 buttons.
 *
 * Replaces the old floating WindowControls, which sat on top of the content
 * and forced every screen to reserve 120px of empty space for it.
 *
 * Outside Electron nothing is rendered, so the page still works in a browser.
 */
export function TgTitleBar({ title = 'TG Focus Filter' }: Props) {
  const isElectron =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('electron')

  const [isMaximized, setIsMaximized] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isElectron) return
    const api = window.electronAPI
    if (!api) return
    if (typeof api.getMaximized === 'function') {
      void api.getMaximized().then(setIsMaximized)
    }
    if (typeof api.onMaximizeChanged === 'function') {
      return api.onMaximizeChanged(setIsMaximized)
    }
  }, [isElectron])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  if (!isElectron) return null

  const btn = cn(
    'grid flex-none place-items-center text-tg-title-btn',
    'transition-colors duration-tg-universal hover:bg-tg-title-btn-over-bg hover:text-tg-title-btn-over',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tg-accent',
  )
  const btnSize = { width: TG_PX.titleButtonWidth, height: TG_PX.titleHeight }

  return (
    <div
      className="relative z-[60] flex flex-none items-center bg-tg-title-bg text-tg-title-text"
      style={{ height: TG_PX.titleHeight, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="min-w-0 flex-1 select-none truncate pl-[10px] text-[12px] font-semibold">
        {title}
      </span>

      <div
        className="flex flex-none items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => window.electronAPI?.minimize()}
          title="Свернуть"
          aria-label="Свернуть"
          style={btnSize}
          className={btn}
        >
          <Minus size={12} strokeWidth={1.6} />
        </button>

        <button
          type="button"
          onClick={() => window.electronAPI?.toggleMaximize()}
          title={isMaximized ? 'Восстановить' : 'Развернуть'}
          aria-label={isMaximized ? 'Восстановить' : 'Развернуть'}
          style={btnSize}
          className={btn}
        >
          {isMaximized
            ? <Copy size={11} strokeWidth={1.6} />
            : <Square size={10} strokeWidth={1.6} />}
        </button>

        <div className="relative flex" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Закрыть"
            aria-label="Закрыть"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={btnSize}
            className={cn(
              btn,
              'hover:bg-tg-title-close-over hover:text-tg-on-accent',
            )}
          >
            <X size={12} strokeWidth={1.6} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className={cn(
                'absolute right-0 top-full z-[70] w-[200px] overflow-hidden py-2',
                'rounded-tg-box bg-tg-menu-bg text-tg-text',
                'shadow-[0_1px_3px_var(--tg-shadow),0_8px_24px_var(--tg-shadow)]',
              )}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  window.electronAPI?.closeToTray()
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-[10px] px-[17px] pb-[7px] pt-2 text-left text-tg-base transition-colors duration-tg-universal hover:bg-tg-bg-over"
              >
                Свернуть в трей
              </button>

              <div className="my-1 h-px bg-tg-menu-separator" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  window.electronAPI?.quit?.()
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-[10px] px-[17px] pb-[7px] pt-2 text-left text-tg-base text-tg-danger transition-colors duration-tg-universal hover:bg-[var(--tg-danger-bg-over)]"
              >
                Закрыть полностью
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the frame**

Create `apps/desktop/src/components/tg/TgWindowFrame.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TgTitleBar } from './TgTitleBar'

interface Props {
  title?: string
  className?: string
  children: ReactNode
}

/**
 * Every screen sits in one of these: title strip on top, content below.
 *
 * The old layout had the window buttons floating over the content, so each
 * screen carried a 120px empty gutter to keep them clickable. That gutter
 * disappears with this frame.
 */
export function TgWindowFrame({ title, className, children }: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-tg-bg text-tg-text">
      <TgTitleBar title={title} />
      <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Extend the re-export file**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgTitleBar } from './TgTitleBar'
export { TgWindowFrame } from './TgWindowFrame'
```

- [ ] **Step 4: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgTitleBar.tsx apps/desktop/src/components/tg/TgWindowFrame.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add the Telegram window strip

24px tall with 36x24 buttons and a semibold 12px title, per widgets.style.
Keeps both items of the close menu and its outside-click and Escape
handling. Unlike the old floating controls it lives in the layout, so
screens stop reserving 120px of empty space for it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Tabs

**Files:**
- Create: `apps/desktop/src/components/tg/TgTabs.tsx`
- Modify: `apps/desktop/src/components/layout/FilterTabs.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `useRipple` from Task 4, `TgBadge` from Task 5.
- Produces: `<TgTabs items={{ id: string; label: string; count?: number }[]} active={string} onChange={(id: string) => void} />`. `FilterTabs` keeps its current external contract exactly: props `active: TabId`, `onChange: (tab: TabId) => void`, `counts?: Partial<Record<TabId, number>>`.

- [ ] **Step 1: Write the tabs**

Create `apps/desktop/src/components/tg/TgTabs.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useRipple } from './useRipple'
import { TgBadge } from './TgBadge'

export interface TgTabItem {
  id: string
  label: string
  count?: number
}

interface Props {
  items: TgTabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/**
 * Telegram section switch: an underline that slides, not a moving pill.
 * The indicator is positioned from measured tab geometry, so labels of
 * different widths stay correct.
 */
export function TgTabs({ items, active, onChange, className }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const [ink, setInk] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab-id="${active}"]`)
      if (el) setInk({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [active, items])

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn('relative flex border-b border-tg-divider bg-tg-bg', className)}
    >
      {items.map((item) => (
        <TabButton
          key={item.id}
          item={item}
          active={item.id === active}
          onSelect={() => onChange(item.id)}
        />
      ))}

      <span
        aria-hidden="true"
        className="absolute bottom-0 h-0.5 rounded-t-sm bg-tg-accent transition-[transform,width] duration-tg-menu ease-out"
        style={{ width: ink.width, transform: `translateX(${ink.left}px)` }}
      />
    </div>
  )
}

function TabButton({
  item,
  active,
  onSelect,
}: {
  item: TgTabItem
  active: boolean
  onSelect: () => void
}) {
  const ripple = useRipple()

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-tab-id={item.id}
      onClick={onSelect}
      {...ripple}
      className={cn(
        'relative flex flex-1 items-center justify-center gap-1.5 overflow-hidden',
        'px-1 pb-2.5 pt-[11px] text-tg-base font-semibold',
        'transition-colors duration-tg-menu',
        '[--tg-ripple-color:rgb(var(--tg-bg-ripple))]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-tg-accent',
        active ? 'text-tg-accent-text' : 'text-tg-text-sub hover:text-tg-text-bold',
      )}
    >
      {item.label}
      {item.count !== undefined && <TgBadge count={item.count} muted={!active} />}
    </button>
  )
}
```

- [ ] **Step 2: Rewrite FilterTabs on top of it**

Replace the whole of `apps/desktop/src/components/layout/FilterTabs.tsx`:

```tsx
import { TgTabs } from '@/components/tg'
import type { TabId } from '@/types/task'

export type { TabId }

const TABS: { id: TabId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'done', label: 'Done' },
  { id: 'snoozed', label: 'Snoozed' },
]

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
  counts?: Partial<Record<TabId, number>>
}

export function FilterTabs({ active, onChange, counts = {} }: Props) {
  return (
    <TgTabs
      items={TABS.map((tab) => ({ ...tab, count: counts[tab.id] }))}
      active={active}
      onChange={(id) => onChange(id as TabId)}
    />
  )
}
```

- [ ] **Step 3: Extend the re-export file**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgTabs } from './TgTabs'
export type { TgTabItem } from './TgTabs'
```

- [ ] **Step 4: Check the tabs in the app**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm run dev
```

Expected: the three tabs now carry an underline that slides between them in 150 ms, counters look like Telegram unread badges, and clicking a tab ripples. Switching tabs still filters the list. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgTabs.tsx apps/desktop/src/components/tg/index.ts apps/desktop/src/components/layout/FilterTabs.tsx
git commit -m "feat: move the tabs to a Telegram underline

Replaces the sliding pill with the underline Telegram uses for section
switches, at the 150ms of defaultSettingsSlider, and renders the counters
as unread badges. FilterTabs keeps its props, so callers are untouched.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Sliding panel

**Files:**
- Create: `apps/desktop/src/components/tg/TgSlidePanel.tsx`
- Modify: `apps/desktop/src/components/tg/index.ts`

**Interfaces:**
- Consumes: `TG_MS` and `TG_PX` from Task 3, framer-motion.
- Produces: `<TgSlidePanel open onClose title? children />` — dimming layer plus a panel that slides in from the right over 240 ms and 100 px. Closes on Escape and on a click on the dimming layer.

- [ ] **Step 1: Write the panel**

Create `apps/desktop/src/components/tg/TgSlidePanel.tsx`:

```tsx
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TG_MS, TG_PX } from '@/lib/tg-motion'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * A panel that covers the screen from the right, the way Telegram opens
 * settings. 240ms over 100px, with the background dimmed in 200ms.
 *
 * The previous implementation hid the main screen with a `hidden` class,
 * which left its keyboard shortcuts live underneath.
 */
export function TgSlidePanel({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: TG_MS.fadeWrap / 1000, ease: 'linear' }}
            onClick={onClose}
            className="absolute inset-0 z-40"
            style={{ background: 'var(--tg-layer)' }}
          />

          <motion.div
            key="panel"
            initial={{ x: TG_PX.slideShift, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: TG_PX.slideShift, opacity: 0 }}
            transition={{ duration: TG_MS.slide / 1000, ease: 'easeOut' }}
            className="absolute inset-0 z-50 flex flex-col bg-tg-bg"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Extend the re-export file**

In `apps/desktop/src/components/tg/index.ts`, add:

```ts
export { TgSlidePanel } from './TgSlidePanel'
```

- [ ] **Step 3: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/tg/TgSlidePanel.tsx apps/desktop/src/components/tg/index.ts
git commit -m "feat: add the sliding panel

240ms over 100px with a 200ms dim, per basic.style. Unmounts its content
when closed, which is what stops shortcuts running under an open panel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Top bar on the kit

**Files:**
- Modify: `apps/desktop/src/components/layout/TopBar.tsx`

**Interfaces:**
- Consumes: `TgIconButton` from Task 5.
- Produces: `TopBar` keeps its props exactly: `inboxCount: number`, `onOpenSettings: () => void`, `onOpenStats: () => void`.

Behaviour that must survive: pin state read from Electron on mount and kept in sync through `onPinChanged`, version read once through `getVersion`, buttons for statistics, settings and pin, and the theme toggle. The 120 px reserved gutter goes, because the window buttons now live in the title strip.

- [ ] **Step 1: Rewrite the file**

Replace the whole of `apps/desktop/src/components/layout/TopBar.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Pin, PinOff, Settings, BarChart2, Sun, Moon } from 'lucide-react'
import { TgIconButton } from '@/components/tg'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  inboxCount: number
  onOpenSettings: () => void
  onOpenStats: () => void
}

/** True when the app runs inside Electron (not a plain browser). */
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export function TopBar({ onOpenSettings, onOpenStats }: Props) {
  const { theme, toggle } = useTheme()
  const [pinned, setPinned] = useState(true)
  const [version, setVersion] = useState<string | null>(null)

  // Sync pin state from Electron on mount and listen for tray-menu changes
  useEffect(() => {
    if (!isElectron) return
    void window.electronAPI!.getPin().then(setPinned)
    const cleanup = window.electronAPI!.onPinChanged(setPinned)
    return cleanup
  }, [])

  // Fetch app version once on mount
  useEffect(() => {
    if (!isElectron) return
    void window.electronAPI!.getVersion().then(setVersion)
  }, [])

  const handlePin = () => window.electronAPI?.togglePin()

  return (
    <header className="flex h-11 flex-none items-center justify-between gap-2 border-b border-tg-divider bg-tg-bg px-2 pl-3">
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span className="select-none text-tg-box font-semibold text-tg-text-bold">
          Задачи
        </span>
        {version && (
          <span className="select-none text-tg-sm text-tg-text-sub">
            v{version}
          </span>
        )}
      </div>

      <div className="flex flex-none items-center gap-0.5">
        <TgIconButton
          label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={toggle}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </TgIconButton>

        <TgIconButton label="Статистика" onClick={onOpenStats}>
          <BarChart2 size={16} />
        </TgIconButton>

        <TgIconButton label="Настройки" onClick={onOpenSettings}>
          <Settings size={16} />
        </TgIconButton>

        {isElectron && (
          <TgIconButton
            label={pinned ? 'Открепить' : 'Закрепить поверх всех окон'}
            onClick={handlePin}
            className={pinned ? 'text-tg-accent-text' : undefined}
          >
            {pinned ? <Pin size={16} /> : <PinOff size={16} />}
          </TgIconButton>
        )}
      </div>
    </header>
  )
}
```

The theme toggle is now an icon button like its neighbours. The old `ThemeToggler` was hidden below 420 px, which is the default window width, so in practice it was invisible. `ThemeToggler.tsx` is deleted in a later stage, once no screen imports it.

- [ ] **Step 2: Check types**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/layout/TopBar.tsx
git commit -m "refactor: rebuild the top bar on the kit

Drops the 120px gutter that existed only to keep the floating window
buttons clickable, and replaces the theme switch that was hidden at 420px
with a normal icon button, 420px being the default window width.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: App shell on the frame and panels

**Files:**
- Modify: `apps/desktop/src/components/layout/AppShell.tsx`
- Modify: `apps/desktop/src/components/settings/SettingsScreen.tsx`
- Modify: `apps/desktop/src/components/stats/StatsScreen.tsx`
- Modify: `apps/desktop/src/components/auth/PinScreen.tsx`

**Interfaces:**
- Consumes: `TgWindowFrame` from Task 8, `TgSlidePanel` from Task 10.
- Produces: no new exports. `AppShell` keeps its props `pinSet: boolean`, `onPinChanged: () => void`.

`AppShell` has six early returns: backend timed out, backend loading, auth status loading, session exists but service did not connect, the Telegram auth screen, and the main interface. Each currently renders `AnimatedGradientBg` and `WindowControls` itself. Each gets wrapped in `TgWindowFrame` instead, and both of those elements are removed from it.

- [ ] **Step 1: Wrap every early return in the frame**

In `apps/desktop/src/components/layout/AppShell.tsx`:

1. Add `import { TgWindowFrame, TgSlidePanel } from '@/components/tg'` to the imports.
2. Delete the imports of `AnimatedGradientBg` (line 3) and `WindowControls` (line 4).
3. The six returns currently render `<AnimatedGradientBg />` at lines 134, 158, 188, 227, 260 and 289. In each one, delete that element, the `<WindowControls />` beside it and any `<DragStrip />`, then replace the outermost `<div className="relative flex h-screen ...">` with `<TgWindowFrame>` and its closing tag with `</TgWindowFrame>`. Line numbers shift as you edit, so work from the last one upwards.

For example, the backend-loading return becomes:

```tsx
    return (
      <TgWindowFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-tg-accent"
                style={{ animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out` }}
              />
            ))}
          </div>
          <p className="text-tg-base text-tg-text-sub">
            {elapsed < 2 ? 'Запуск...' : `Подключение${elapsed > 4 ? ` (${elapsed}с)` : '...'}`}
          </p>
          <style>{`
            @keyframes bounce {
              0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
              40%            { transform: scale(1);   opacity: 1;   }
            }
          `}</style>
        </div>
      </TgWindowFrame>
    )
```

Keep every Russian string exactly as it is. Only the wrapper and the colour classes change.

- [ ] **Step 2: Delete the local drag strip**

`AppShell.tsx` defines a `DragStrip` component near the top, whose comment mentions reserving 120 px for `WindowControls`. The title bar is the drag region now. Delete the component and every use of it.

- [ ] **Step 3: Put settings and statistics into sliding panels**

In the main-interface return, replace the conditional rendering of `SettingsScreen` and `StatsScreen`, and the `hidden` class on the main column, with panels:

```tsx
      <TgSlidePanel open={showSettings} onClose={() => setShowSettings(false)}>
        <SettingsScreen
          onClose={() => setShowSettings(false)}
          pinSet={pinSet}
          onPinChanged={onPinChanged}
          onSaved={() => setTaskRefreshKey((k) => k + 1)}
        />
      </TgSlidePanel>

      <TgSlidePanel open={showStats} onClose={() => setShowStats(false)}>
        <StatsScreen onClose={() => setShowStats(false)} />
      </TgSlidePanel>
```

Those are the exact props both screens take today: `SettingsScreen` has `onClose`, `pinSet`, `onPinChanged` and `onSaved`; `StatsScreen` has only `onClose`. Neither signature changes.

The main column keeps its normal classes with no `hidden`:

```tsx
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
```

- [ ] **Step 4: Remove the Escape handler that the panel now owns**

`AppShell.tsx` has a `useEffect` that listens for Escape to close settings and statistics. `TgSlidePanel` does this for its own content, so delete that effect to avoid two handlers racing.

- [ ] **Step 5: Remove the reserved gutters from the two screens**

In `apps/desktop/src/components/settings/SettingsScreen.tsx` around line 442, delete the absolutely positioned 120 px no-drag element and the `pr-[120px]` from its header. Do the same in `apps/desktop/src/components/stats/StatsScreen.tsx` around line 233. Change nothing else in either file; both are rewritten in later stages.

- [ ] **Step 6: Put the PIN screen in the frame**

In `apps/desktop/src/components/auth/PinScreen.tsx`, delete the imports and uses of `AnimatedGradientBg` and `WindowControls`, and wrap the returned markup in `TgWindowFrame`. Leave the PIN logic, the shake animation and every string untouched.

- [ ] **Step 7: Check types and run**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npx tsc -b
npm run dev
```

Expected: a 24 px Telegram strip at the top of every screen, dragging the window by it works, settings and statistics slide in from the right over the list and dim it, Escape closes them, and the list is visible behind the dimming rather than hidden.

- [ ] **Step 8: Verify the shortcut bug is gone**

With the app running: open Settings, press Ctrl+D, close Settings.

Expected: no task was completed and no reaction was sent to Telegram. Before this change the shortcut fired underneath the open panel.

- [ ] **Step 9: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/layout/AppShell.tsx apps/desktop/src/components/settings/SettingsScreen.tsx apps/desktop/src/components/stats/StatsScreen.tsx apps/desktop/src/components/auth/PinScreen.tsx
git commit -m "refactor: put every screen in the window frame

All six AppShell states, plus the PIN screen, now render inside the shared
frame instead of drawing floating window buttons and a gradient background
of their own.

Settings and statistics slide in as panels rather than being hidden with a
CSS class. That also fixes the shortcut bug: the task list used to stay
mounted and live under an open panel, so Ctrl+D completed a task and sent
a Telegram reaction while the user was in Settings.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Remove the old window controls and check the stage

**Files:**
- Delete: `apps/desktop/src/components/ui/WindowControls.tsx`

- [ ] **Step 1: Confirm nothing imports it**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rn "WindowControls" src --include=*.tsx --include=*.ts
```

Expected: no output. If anything is listed, wrap that screen in `TgWindowFrame` first, the same way Task 12 did.

- [ ] **Step 2: Delete the file**

```bash
cd D:/Telegram-Task-Filter
git rm apps/desktop/src/components/ui/WindowControls.tsx
```

- [ ] **Step 3: Run every check**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm test
npx tsc -b
npm run build
```

Expected: tests pass, no type errors, build succeeds.

- [ ] **Step 4: Walk the stage checklist in the running app**

```bash
cd D:/Telegram-Task-Filter/apps/desktop
npm run dev
```

Check each item and note any failure before committing:

1. Window opens with the Telegram night background, not near-black.
2. Switching to the light theme turns the window white, and it stays white after a restart with no dark flash.
3. Title strip is thin, title reads «TG Focus Filter», dragging it moves the window.
4. Minimise works. Maximise works and the icon changes. Hovering the close button turns it red.
5. The close menu offers «Свернуть в трей» and «Закрыть полностью», closes on an outside click and on Escape, and both items do what they say.
6. Tabs underline slides, counters look like unread badges, tab switching still filters.
7. Clicking a tab or an icon button produces a ripple from the click point.
8. Settings slide in from the right, dim the list, and close on Escape and on a click on the dimmed area.
9. Ctrl+D while Settings are open does nothing.
10. Ctrl+D on the task list completes the first inbox task, Ctrl+Z undoes it, Ctrl+F focuses the search, arrows move the selection.
11. Resize the window down to 340 px: nothing overlaps the window buttons and no horizontal scrollbar appears.

- [ ] **Step 5: Commit**

```bash
cd D:/Telegram-Task-Filter
git add apps/desktop/src/components/ui/WindowControls.tsx
git commit -m "refactor: drop the floating window controls

Replaced by the title strip. Ends stage 1: the shell is on the Telegram
palette, metrics and motion, while the task list, cards and settings still
carry their old layout and are rewritten in stage 2.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## What stays for later stages

Stage 2 rewrites the task list, card and detail modal. Stage 3 rewrites settings and the chat picker. Stage 4 covers statistics, auth, PIN and the update dialog, and deletes `SetupWizard`. Stage 5 removes `AnimatedGradientBg`, `ThemeToggler` and the shadcn colour aliases from the Tailwind config, and adds the high-contrast switch to settings.

The check that the palette migration is complete is a search that must come back empty:

```bash
cd D:/Telegram-Task-Filter/apps/desktop
grep -rnE "indigo|amber|emerald|slate|bg-background|text-muted-foreground" src --include=*.tsx
```

Each later stage gets its own plan, written the same way, with the behaviour inventory of the screens it touches taken immediately before the work.
