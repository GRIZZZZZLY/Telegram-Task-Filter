/**
 * Native dialog helpers.
 *
 * In Electron: delegates to dialog.showMessageBox via IPC (nativeConfirm).
 * In browser dev mode: falls back to window.confirm.
 */

/**
 * Show a confirmation dialog.
 * Returns true if the user confirmed, false if cancelled.
 */
export async function nativeConfirm(message: string): Promise<boolean> {
  if (window.electronAPI?.confirm) {
    return window.electronAPI.confirm(message)
  }
  // Fallback for plain browser / Vite dev without Electron
  return window.confirm(message)
}
