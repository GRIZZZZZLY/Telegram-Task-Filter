/**
 * Electron preload script.
 *
 * Exposes a minimal, safe API to the renderer via contextBridge.
 * Renderer accesses it as `window.electronAPI`.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  /** Minimize the window to taskbar */
  minimize: () => ipcRenderer.send('window:minimize'),

  /** Hide the window to system tray */
  closeToTray: () => ipcRenderer.send('window:close'),

  /** Toggle always-on-top pin state */
  togglePin: () => ipcRenderer.send('window:toggle-pin'),

  /** Get current pin state (async) */
  getPin: (): Promise<boolean> => ipcRenderer.invoke('window:get-pin'),

  /** Listen for pin state changes pushed from main process */
  onPinChanged: (cb: (pinned: boolean) => void) => {
    ipcRenderer.on('pin-changed', (_event, pinned: boolean) => cb(pinned))
    return () => ipcRenderer.removeAllListeners('pin-changed')
  },

  /**
   * Show a native OS notification.
   * Clicking the notification brings the app window to front.
   */
  notify: (title: string, body: string) =>
    ipcRenderer.send('app:notify', { title, body }),

  /** Enable or disable sound in native notifications */
  setSoundEnabled: (enabled: boolean) =>
    ipcRenderer.send('app:set-sound', enabled),

  /** Enable or disable OS toast notifications entirely */
  setNotificationsEnabled: (enabled: boolean) =>
    ipcRenderer.send('app:set-notifications', enabled),

  /** Get the app version string (e.g. "0.2.0") */
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),

  /** Open a URL in the system default browser (bypasses Electron window) */
  openExternal: (url: string) =>
    ipcRenderer.send('shell:open-external', url),

  /** Toggle maximize / restore window */
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),

  /** Get current maximized state (async) */
  getMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:get-maximized'),

  /** Listen for maximize state changes pushed from main process */
  onMaximizeChanged: (cb: (maximized: boolean) => void) => {
    ipcRenderer.on('maximize-changed', (_event, maximized: boolean) => cb(maximized))
    return () => ipcRenderer.removeAllListeners('maximize-changed')
  },

  /** Quit the app completely (kills the process) */
  quit: () => ipcRenderer.send('app:quit'),

  /** Open the logs folder in Windows Explorer */
  openLogsFolder: () => ipcRenderer.send('app:open-logs-folder'),

  /** Show a native Electron confirmation dialog; returns true if confirmed */
  confirm: (message: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', message),
})
