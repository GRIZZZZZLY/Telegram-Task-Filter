/**
 * Global keyboard shortcut hook for the task list.
 *
 * Shortcuts:
 *  Ctrl+D / Cmd+D  — mark the selected inbox task as done (selects the first one
 *                    when nothing is selected yet, so the first press never acts
 *                    on a task the user cannot see)
 *  Ctrl+Z / Cmd+Z  — undo last done (if pendingUndo is set)
 *  Ctrl+F / Cmd+F  — focus the search input
 *  Escape          — close settings/stats panel; clear search
 *  ArrowUp / ArrowDown — navigate task selection
 *
 * Usage:
 *   const { selectedTaskId, setSelectedTaskId } = useKeyboard({ ... })
 */

import { useEffect, useCallback, useState } from 'react'
import type { Task } from '@/types/task'

interface UseKeyboardOptions {
  /** Visible (filtered) tasks in current tab */
  tasks: Task[]
  /** Called when Ctrl+D is pressed on a task */
  onDone: (id: number) => void
  /** Called when Ctrl+Z is pressed and there is a pending undo */
  onUndo: (() => void) | null
  /** Ref to the search <input> element */
  searchInputRef: React.RefObject<HTMLInputElement | null>
  /** Called when Escape is pressed (e.g. close settings panel) */
  onEscape?: () => void
  /** Whether the keyboard hook is active (e.g. disabled on PinScreen) */
  enabled?: boolean
}

interface UseKeyboardResult {
  selectedTaskId: number | null
  setSelectedTaskId: (id: number | null) => void
}

export function useKeyboard({
  tasks,
  onDone,
  onUndo,
  searchInputRef,
  onEscape,
  enabled = true,
}: UseKeyboardOptions): UseKeyboardResult {
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

  // Keep selection valid when task list changes
  useEffect(() => {
    if (selectedTaskId === null) return
    const stillExists = tasks.some((t) => t.id === selectedTaskId)
    if (!stillExists) {
      setSelectedTaskId(tasks.length > 0 ? tasks[0].id : null)
    }
  }, [tasks, selectedTaskId])

  const getSelectedIndex = useCallback(() => {
    if (selectedTaskId === null) return -1
    return tasks.findIndex((t) => t.id === selectedTaskId)
  }, [tasks, selectedTaskId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      const ctrl = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // ── Ctrl+D — mark done ────────────────────────────────────────────────
      if (ctrl && e.key === 'd' && !isInput) {
        e.preventDefault()
        const inboxTasks = tasks.filter((t) => t.status === 'inbox')
        if (inboxTasks.length === 0) return

        // Done always acts on the visible selection: it sends a reaction and a
        // reply into someone else's chat, so it never guesses a target.
        if (selectedTaskId === null || !inboxTasks.some((t) => t.id === selectedTaskId)) {
          setSelectedTaskId(inboxTasks[0].id)
          return
        }

        onDone(selectedTaskId)
        return
      }

      // ── Ctrl+Z — undo ─────────────────────────────────────────────────────
      if (ctrl && e.key === 'z' && !isInput) {
        if (onUndo) {
          e.preventDefault()
          onUndo()
        }
        return
      }

      // ── Ctrl+F — focus search ─────────────────────────────────────────────
      if (ctrl && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      // ── Escape — close panel / clear search ───────────────────────────────
      if (e.key === 'Escape') {
        if (isInput) {
          // If search is focused, blur it (TaskList handles clearing)
          ;(target as HTMLInputElement).blur()
          return
        }
        onEscape?.()
        return
      }

      // ── Arrow navigation — skip when typing in an input ───────────────────
      if (isInput) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const idx = getSelectedIndex()
        const next = idx < tasks.length - 1 ? tasks[idx + 1] : tasks[0]
        if (next) setSelectedTaskId(next.id)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = getSelectedIndex()
        const prev = idx > 0 ? tasks[idx - 1] : tasks[tasks.length - 1]
        if (prev) setSelectedTaskId(prev.id)
        return
      }
    },
    [enabled, tasks, selectedTaskId, onDone, onUndo, searchInputRef, onEscape, getSelectedIndex],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { selectedTaskId, setSelectedTaskId }
}
