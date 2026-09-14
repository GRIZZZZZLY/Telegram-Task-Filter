/**
 * The updater state that the Electron main process pushes to the page.
 *
 * It arrives over IPC as plain JSON, so every field is checked rather than
 * trusted. This parser had two identical copies — one in the update dialog,
 * one in the settings section.
 */
export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  progress: number
  message: string | null
  checkedAt: string | null
}

export function parseUpdateState(value: unknown): UpdateState | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<UpdateState>
  if (typeof v.status !== 'string' || typeof v.currentVersion !== 'string') return null
  return {
    status: v.status as UpdateStatus,
    currentVersion: v.currentVersion,
    availableVersion: typeof v.availableVersion === 'string' ? v.availableVersion : null,
    progress: typeof v.progress === 'number' ? v.progress : 0,
    message: typeof v.message === 'string' ? v.message : null,
    checkedAt: typeof v.checkedAt === 'string' ? v.checkedAt : null,
  }
}

/** The four states where the dialog has something to ask or report. */
export function isUpdateDialogVisible(state: UpdateState | null): boolean {
  if (!state) return false
  return ['available', 'downloading', 'downloaded', 'error'].includes(state.status)
}
