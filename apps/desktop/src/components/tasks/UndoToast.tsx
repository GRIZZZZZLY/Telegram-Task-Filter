import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

interface Props {
  taskId: number | null
  taskTitle: string
  onUndo: (id: number) => void
  onExpire: () => void
  timeoutMs?: number
}

export function UndoToast({
  taskId,
  taskTitle,
  onUndo,
  onExpire,
  timeoutMs = 5000,
}: Props) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    if (taskId === null) {
      setProgress(100)
      return
    }

    setProgress(100)
    const start = Date.now()

    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / timeoutMs) * 100)
      setProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onExpire()
      }
    }, 50)

    return () => clearInterval(interval)
  }, [taskId, timeoutMs, onExpire])

  return (
    <AnimatePresence>
      {taskId !== null && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md">
            {/* Прогресс-бар */}
            <div
              className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 transition-none"
              style={{ width: `${progress}%` }}
            />

            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground">
                ✅{' '}
                <span className="font-medium">
                  {taskTitle.length > 40
                    ? `${taskTitle.slice(0, 40)}…`
                    : taskTitle}
                </span>{' '}
                отмечено готовым
              </span>
              <button
                onClick={() => onUndo(taskId)}
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Отмена
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
