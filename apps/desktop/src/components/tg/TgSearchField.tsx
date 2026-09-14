import type { RefObject } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (next: string) => void
  placeholder: string
  /** The same ref the keyboard hook focuses on Ctrl+F. */
  inputRef?: RefObject<HTMLInputElement>
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
