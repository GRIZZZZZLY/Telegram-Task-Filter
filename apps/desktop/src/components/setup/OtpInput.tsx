/**
 * OTP Input — Clerk-style 5-digit code input
 * Inspired by Eldora UI — реализован нативно без зависимостей
 */
import { useRef, KeyboardEvent, ClipboardEvent } from 'react'
import { cn } from '@/lib/utils'

const CODE_LENGTH = 5

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function OtpInput({ value, onChange, disabled = false }: Props) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '')

  const focus = (i: number) => {
    inputsRef.current[Math.min(Math.max(i, 0), CODE_LENGTH - 1)]?.focus()
  }

  const update = (i: number, char: string) => {
    const next = digits.slice()
    next[i] = char
    onChange(next.join(''))
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
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    onChange(pasted.padEnd(value.length > pasted.length ? value.length : pasted.length, value.slice(pasted.length)).slice(0, CODE_LENGTH))
    onChange(pasted)
    focus(Math.min(pasted.length, CODE_LENGTH - 1))
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
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-12 w-10 rounded-lg border text-center text-lg font-semibold',
            'bg-background transition-colors outline-none',
            'border-border focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            digit ? 'border-indigo-500/50 text-foreground' : 'text-muted-foreground',
          )}
        />
      ))}
    </div>
  )
}
