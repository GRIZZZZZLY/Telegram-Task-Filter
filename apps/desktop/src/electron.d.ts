/**
 * TypeScript declarations for the Electron preload API.
 * Available on `window.electronAPI` when running inside Electron.
 * In browser mode (plain Vite dev), `window.electronAPI` is undefined.
 */
export {}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void
      closeToTray: () => void
      togglePin: () => void
      getPin: () => Promise<boolean>
      onPinChanged: (cb: (pinned: boolean) => void) => () => void
      /** Show a native OS notification; click brings app to front */
      notify: (title: string, body: string) => void
      /** Enable or disable sound in native notifications */
      setSoundEnabled: (enabled: boolean) => void
      /** Open a URL in the system default browser */
      openExternal: (url: string) => void
      /** Toggle maximize / restore window */
      toggleMaximize: () => void
      /** Get current maximized state */
      getMaximized: () => Promise<boolean>
      /** Listen for maximize state changes pushed from main process */
      onMaximizeChanged: (cb: (maximized: boolean) => void) => () => void
      /** Quit the app completely */
      quit: () => void
    }
  }
}
