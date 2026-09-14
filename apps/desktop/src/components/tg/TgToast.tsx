import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TG_MS } from '@/lib/tg-motion'

interface Props {
  open: boolean
  text: string
  /** Optional action, e.g. "Отменить". */
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  /** How long the toast stays before it fades. */
  durationMs?: number
}

/**
 * Telegram toast: appears in 200ms while sliding 160ms, waits, then fades
 * over a full second. Sits at the bottom of the nearest positioned parent.
 */
export function TgToast({
  open,
  text,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 5000,
}: Props) {
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(t)
  }, [open, durationMs, onDismiss])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: TG_MS.toastIn / 1000, ease: 'easeOut' },
            y: { duration: TG_MS.toastSlide / 1000, ease: 'easeOut' },
          }}
          className="absolute inset-x-[13px] bottom-[13px] z-[80] flex items-center gap-3 rounded-tg-box px-[19px] pb-3 pt-[13px] text-tg-base text-white"
          style={{ background: 'rgba(20, 28, 36, 0.92)' }}
        >
          <span className="min-w-0 flex-1 truncate">{text}</span>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="flex-none p-1 text-tg-base font-semibold uppercase tracking-wide text-tg-accent-text"
            >
              {actionLabel}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
