/**
 * Text display utilities.
 *
 * Mention handles are stored as a module-level singleton (set once from
 * AppShell when settings load) so TaskCard / TaskDetailModal can use them
 * without prop drilling.
 */

// ── Mention handles store ─────────────────────────────────────────────────────

let _handles: string[] = []

/**
 * Parse and store the configured mention handles.
 * Call once from AppShell after settings load.
 * Accepts the raw comma-separated string from settings, e.g. "@igor,@igor_work"
 */
export function setMentionHandles(raw: string): void {
  _handles = raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

export function getMentionHandles(): string[] {
  return _handles
}

// ── Text stripping ────────────────────────────────────────────────────────────

/**
 * Remove leading @mention(s) from text.
 *
 * Strips any configured handle that appears at the very start of the string
 * (case-insensitive), including trailing whitespace/punctuation after it.
 *
 * Examples (handles = ["@igor"]):
 *   "@igor сделай отчёт"        → "сделай отчёт"
 *   "@Igor, сделай отчёт"       → "сделай отчёт"
 *   "@igor @igor_work сделай"   → "@igor_work сделай"  (only exact handle stripped)
 *   "сделай отчёт"              → "сделай отчёт"       (no handle → unchanged)
 *   "@other сделай"             → "@other сделай"      (unknown handle → unchanged)
 */
export function stripLeadingMentions(text: string, handles = _handles): string {
  if (!handles.length || !text) return text

  let result = text.trim()

  // Repeatedly strip handles from the start (a message may start with multiple mentions)
  let changed = true
  while (changed) {
    changed = false
    for (const handle of handles) {
      // handle already includes '@', e.g. "@igor"
      const lower = result.toLowerCase()
      if (!lower.startsWith(handle)) continue

      // Make sure it's a full token: next char must be whitespace, comma, or end of string
      const after = result[handle.length]
      if (after !== undefined && !/[\s,]/.test(after)) continue

      result = result.slice(handle.length).replace(/^[\s,]+/, '')
      changed = true
      break
    }
  }

  // Capitalise first letter if the original started with uppercase and result doesn't
  if (result && text[0] === text[0].toUpperCase() && result[0] === result[0].toLowerCase()) {
    result = result[0].toUpperCase() + result.slice(1)
  }

  return result || text // fallback: if stripping ate everything, return original
}
