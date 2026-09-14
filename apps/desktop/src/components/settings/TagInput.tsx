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
