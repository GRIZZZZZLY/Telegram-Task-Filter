/**
 * Animated Theme Toggler
 * Magic UI–inspired — анимированный переключатель тёмной/светлой темы
 */
import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'

interface Props {
  theme: 'dark' | 'light'
  onToggle: () => void
}

export function ThemeToggler({ theme, onToggle }: Props) {
  const isDark = theme === 'dark'

  return (
    <button
      onClick={onToggle}
      aria-label="Переключить тему"
      className={[
        'relative flex h-8 w-14 cursor-pointer items-center rounded-full border px-1 transition-colors duration-300',
        isDark
          ? 'border-white/10 bg-white/5'
          : 'border-black/10 bg-black/5',
      ].join(' ')}
    >
      <motion.div
        className={[
          'flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-colors duration-300',
          isDark ? 'bg-indigo-500' : 'bg-amber-400',
        ].join(' ')}
        animate={{ x: isDark ? 0 : 22 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-white" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-white" />
        )}
      </motion.div>
    </button>
  )
}
