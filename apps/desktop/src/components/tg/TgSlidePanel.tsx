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
