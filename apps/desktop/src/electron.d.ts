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
      /** Enable or disable OS toast notifications entirely */
      setNotificationsEnabled: (enabled: boolean) => void
      /** Get the app version string */
      getVersion: () => Promise<string>
      /** Open a URL in the system default browser */
      openExternal: (url: string) => void
      /** Get current updater state */
      updatesGetState: () => Promise<unknown>
      /** Trigger update check */
      updatesCheck: () => Promise<unknown>
      /** Download available update */
      updatesDownload: () => Promise<unknown>
      /** Install downloaded update and restart */
      updatesInstall: () => void
      /** Listen for updater state changes */
      onUpdatesStateChanged: (cb: (state: unknown) => void) => () => void
      /** Toggle maximize / restore window */
      toggleMaximize: () => void
      setTheme: (theme: 'dark' | 'light') => void
      /** Get current maximized state */
      getMaximized: () => Promise<boolean>
      /** Listen for maximize state changes pushed from main process */
      onMaximizeChanged: (cb: (maximized: boolean) => void) => () => void
      /** Quit the app completely */
      quit: () => void
      /** Open the logs folder in Windows Explorer */
      openLogsFolder: () => void
      /** Show a native Electron confirmation dialog; returns true if confirmed */
      confirm: (message: string) => Promise<boolean>
    }
  }
}
