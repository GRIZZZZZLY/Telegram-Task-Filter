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
