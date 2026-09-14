import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
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
  },
  plugins: [],
}

export default config
