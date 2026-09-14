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
