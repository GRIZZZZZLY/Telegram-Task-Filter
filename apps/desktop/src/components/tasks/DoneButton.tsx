/**
 * Interactive Hover Button — Magic UI inspired
 * Главное действие на карточке задачи
 */
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

interface Props {
  onClick: () => void
  loading?: boolean
}

export function DoneButton({ onClick, loading = false }: Props) {
  return (
    <motion.button
      onClick={onClick}
      disabled={loading}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={[
        'group relative flex items-center gap-1.5 overflow-hidden rounded-lg',
        'bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-400',
        'border border-indigo-500/20 transition-colors',
        'hover:bg-indigo-500 hover:text-white hover:border-indigo-500',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      ].join(' ')}
    >
      {/* Shimmer эффект при hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 group-hover:translate-x-full"
      />
      <Check className="h-3.5 w-3.5 shrink-0" />
      <span>{loading ? '...' : 'Done'}</span>
    </motion.button>
  )
}
