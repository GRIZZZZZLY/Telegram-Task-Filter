import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TG_MS } from '@/lib/tg-motion'
import { TgIconButton } from './TgIconButton'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  /** False while an operation must not be interrupted: no cross, no dismiss. */
  closable?: boolean
  /** Buttons along the bottom edge. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Telegram box: dimmed background, rounded panel, title row, actions at the
 * bottom. Replaces two hand-rolled modal shells.
 */
export function TgModal({
  open,
  onClose,
  title,
  subtitle,
  closable = true,
  footer,
  children,
  className,
}: Props) {
  useEffect(() => {
    if (!open || !closable) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closable, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: TG_MS.fadeWrap / 1000, ease: 'linear' }}
            onClick={closable ? onClose : undefined}
            className="fixed inset-0 z-[90]"
            style={{ background: 'var(--tg-layer)' }}
          />

          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: TG_MS.menuShow / 1000, ease: 'easeOut' }}
            className={cn(
              'fixed inset-x-3 top-12 z-[95] flex max-h-[calc(100%-6rem)] flex-col overflow-hidden',
              'rounded-tg-box bg-tg-box-bg',
              'shadow-[0_1px_3px_var(--tg-shadow),0_12px_32px_var(--tg-shadow)]',
              className,
            )}
          >
            <div className="flex flex-none items-start gap-2 border-b border-tg-divider px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-tg-box font-semibold text-tg-box-title">{title}</p>
                {subtitle && <p className="mt-0.5 text-tg-sm text-tg-text-sub">{subtitle}</p>}
              </div>
              {closable && (
                <TgIconButton label="Закрыть" size={26} onClick={onClose}>
                  <X className="h-3.5 w-3.5" />
                </TgIconButton>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>

            {footer && (
              <div className="flex flex-none items-center justify-end gap-2 border-t border-tg-divider px-4 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
