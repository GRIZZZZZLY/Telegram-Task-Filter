/**
 * Electron main process.
 *
 * Features:
 *  - Auto-starts the Python FastAPI backend on launch
 *  - Frameless, always-on-top floating window
 *  - System tray: click to show/hide, right-click menu
 *  - Pin toggle: switch between always-on-top and normal
 *  - Close button hides to tray (app stays running)
 *  - Dev: loads http://localhost:5173 | Prod: loads dist/index.html
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, Notification, dialog, shell } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import { deflateSync } from 'zlib'

// ── Types ─────────────────────────────────────────────────────────────────────
interface WindowState { x: number; y: number; width: number; height: number }

interface UpdaterState {
  status: 'idle' | 'unsupported' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  availableVersion: string | null
  progress: number
  message: string | null
  checkedAt: string | null
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// vite-plugin-electron sets this env var when the dev server is ready.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const BACKEND_URL = 'http://localhost:8787'

// In dev:  __dirname = dist-electron/ → ../../.. = D:/Telegram-Task-Filter
// In prod: __PROJECT_ROOT__ is baked in by vite.config.ts at build time
declare const __PROJECT_ROOT__: string
const PROJECT_ROOT = app.isPackaged
  ? __PROJECT_ROOT__
  : path.resolve(__dirname, '../../..')

// Writable user-data directory — set once the app is ready (see whenReady).
// In packaged mode: %APPDATA%\TG Focus Filter\
// In dev mode:      same value, but ignored — backend uses project root
let APP_DATA_DIR = ''

/** Default .env written on first run (no Telegram credentials — user enters via UI). */
const DEFAULT_ENV_CONTENT = `# TG Focus Filter — user configuration
# Edit this file or use the Settings screen in the app.

APP_ENV=prod

# Telegram API credentials — obtain at https://my.telegram.org/apps
TG_API_ID=
TG_API_HASH=
TG_PHONE=

# Reaction shown when task is marked done (must be a valid Telegram reaction emoji)
DONE_REACTION=\xf0\x9f\x91\x8d
DONE_SEND_REPLY=true
DONE_REPLY_TEXT=\xd0\x93\xd0\xbe\xd1\x82\xd0\xbe\xd0\xb2\xd0\xbe \xe2\x9c\x85
DONE_COMMIT_DELAY_SECONDS=5

# Filters
FILTER_IGNORE_OWN=true
FILTER_MIN_TEXT_LENGTH=0
FILTER_STRICT_MENTIONS=true
TG_CONTEXT_LIFT_ENABLED=false

# Auto-cleanup (0 = disabled)
CLEANUP_DONE_AFTER_DAYS=0

# UI
SOUND_ENABLED=true
COMPACT_MODE=false
`

/**
 * Prepare the user-data directory on first run:
 *  - Create sessions/ and data/ subdirectories
 *  - Write a default .env if one doesn't exist yet
 */
function ensureUserDataDir(): void {
  fs.mkdirSync(path.join(APP_DATA_DIR, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(APP_DATA_DIR, 'data'), { recursive: true })

  const envFile = path.join(APP_DATA_DIR, '.env')
  if (!fs.existsSync(envFile)) {
    // Write raw UTF-8 content — the escape sequences above produce the
    // actual Unicode characters (👍, Готово ✅) without embedding them
    // as literals in the source file.
    const content = [
      '# TG Focus Filter — user configuration',
      '# Edit this file or use the Settings screen in the app.',
      '',
      'APP_ENV=prod',
      '',
      '# Telegram API credentials — obtain at https://my.telegram.org/apps',
      'TG_API_ID=',
      'TG_API_HASH=',
      'TG_PHONE=',
      '',
      '# Reaction shown when task is marked done (must be a valid Telegram reaction emoji)',
      'DONE_REACTION=\uD83D\uDC4D',
      'DONE_SEND_REPLY=true',
      'DONE_REPLY_TEXT=\u0413\u043E\u0442\u043E\u0432\u043E \u2705',
      'DONE_COMMIT_DELAY_SECONDS=5',
      '',
      '# Filters',
      'FILTER_IGNORE_OWN=true',
      'FILTER_MIN_TEXT_LENGTH=0',
      'FILTER_STRICT_MENTIONS=true',
      'TG_CONTEXT_LIFT_ENABLED=false',
      '',
      '# Auto-cleanup (0 = disabled)',
      'CLEANUP_DONE_AFTER_DAYS=0',
      '',
      '# Catch-up scan on startup (0 = disabled, max 168 h)',
      'CATCHUP_HOURS=8',
      '',
      '# UI',
      'NOTIFICATIONS_ENABLED=true',
      'SOUND_ENABLED=true',
      'COMPACT_MODE=false',
    ].join('\n')
    fs.writeFileSync(envFile, content, 'utf-8')
    console.log('[FirstRun] Created default .env at', envFile)
  }
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
let isPinned = true
let soundEnabled = true
let notificationsEnabled = true
let backendProc: ChildProcess | null = null
let saveStateTimeout: ReturnType<typeof setTimeout> | null = null
let logStream: fs.WriteStream | null = null
let updaterState: UpdaterState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progress: 0,
  message: null,
  checkedAt: null,
}
let autoUpdaterRef: {
  autoDownload: boolean
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: () => void
  on: (event: string, listener: (...args: unknown[]) => void) => void
} | null = null

// ── File logging ─────────────────────────────────────────────────────────────

function initFileLogging(): void {
  try {
    const logsDir = path.join(APP_DATA_DIR, 'logs')
    fs.mkdirSync(logsDir, { recursive: true })
    const dateStr = new Date().toISOString().slice(0, 10)
    logStream = fs.createWriteStream(path.join(logsDir, `app-${dateStr}.log`), { flags: 'a' })

    const _origLog = console.log.bind(console)
    const _origWarn = console.warn.bind(console)
    const _origError = console.error.bind(console)

    const writeLine = (level: string, ...args: unknown[]) => {
      const msg = `${new Date().toISOString()} ${level} ${args.map(String).join(' ')}\n`
      logStream?.write(msg)
    }

    console.log   = (...args) => { _origLog(...args);   writeLine('[INFO ]', ...args) }
    console.warn  = (...args) => { _origWarn(...args);  writeLine('[WARN ]', ...args) }
    console.error = (...args) => { _origError(...args); writeLine('[ERROR]', ...args) }
  } catch (e) {
    console.error('[Logs] Failed to init file logging:', e)
  }
}

// ── Window state persistence ──────────────────────────────────────────────────

function windowStatePath(): string {
  return path.join(APP_DATA_DIR, 'window-state.json')
}

function readWindowState(): Partial<WindowState> {
  try {
    const raw = fs.readFileSync(windowStatePath(), 'utf-8')
    return JSON.parse(raw) as WindowState
  } catch {
    return {}
  }
}

function saveWindowState(): void {
  if (!win || win.isMinimized() || win.isMaximized()) return
  const bounds = win.getBounds()
  try {
    fs.writeFileSync(windowStatePath(), JSON.stringify(bounds), 'utf-8')
  } catch {
    // non-fatal
  }
}

// ── Icon generator (no external deps) ────────────────────────────────────────

function uint32BE(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function crc32(data: Buffer): number {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  let crc = 0xffffffff
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const combined = Buffer.concat([typeBytes, data])
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crc32(combined))])
}

function makePng16(r: number, g: number, b: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdrData = Buffer.concat([uint32BE(16), uint32BE(16), Buffer.from([8, 2, 0, 0, 0])])
  const raw = Buffer.alloc(16 * (1 + 16 * 3))
  for (let row = 0; row < 16; row++) {
    const off = row * (1 + 16 * 3)
    raw[off] = 0
    for (let col = 0; col < 16; col++) {
      raw[off + 1 + col * 3] = r
      raw[off + 1 + col * 3 + 1] = g
      raw[off + 1 + col * 3 + 2] = b
    }
  }
  return Buffer.concat([sig, pngChunk('IHDR', ihdrData), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}

function iconCandidates(): string[] {
  if (app.isPackaged) {
    return [
      path.join(process.resourcesPath, 'assets', 'icon.ico'),
      path.join(process.resourcesPath, 'icon.ico'),
    ]
  }
  return [
    path.join(PROJECT_ROOT, 'apps', 'desktop', 'assets', 'icon.ico'),
    path.join(PROJECT_ROOT, 'apps', 'desktop', 'public', 'icon.ico'),
  ]
}

function createAppIcon(): nativeImage {
  for (const candidate of iconCandidates()) {
    if (fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate)
      if (!img.isEmpty()) return img
    }
  }
  try {
    return nativeImage.createFromBuffer(makePng16(79, 70, 229))
  } catch {
    return nativeImage.createEmpty()
  }
}

function createTrayIcon(): nativeImage {
  return createAppIcon()
}

// ── Backend management ────────────────────────────────────────────────────────

/** Returns true if the backend is already accepting requests. */
async function isBackendRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(300),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Spawns the FastAPI backend unless it's already running.
 *
 * Packaged mode: runs the PyInstaller-bundled backend.exe from resources/backend/.
 * Dev mode:      runs `python -m uvicorn` from the project venv (same as before).
 *
 * APP_DATA_DIR is passed as an environment variable so the backend knows where
 * to find .env, sessions/, and data/ on any machine.
 */
function startBackend(): void {
  let cmd: string
  let args: string[]
  let cwd: string

  if (app.isPackaged) {
    // Packaged: backend.exe lives inside resources/backend/ (extraResources)
    cmd = path.join(process.resourcesPath, 'backend', 'backend.exe')
    args = []
    cwd = APP_DATA_DIR
  } else {
    // Dev: use the project venv Python with hot-reload
    cmd = process.platform === 'win32'
      ? path.join(PROJECT_ROOT, 'services/api/.venv/Scripts/python.exe')
      : path.join(PROJECT_ROOT, 'services/api/.venv/bin/python')
    args = ['-m', 'uvicorn', 'app.main:app', '--port', '8787']
    if (VITE_DEV_SERVER_URL) args.push('--reload')
    cwd = path.join(PROJECT_ROOT, 'services/api')
  }

  console.log('[Backend] Spawning:', cmd, args.join(' '))
  console.log('[Backend] APP_DATA_DIR:', APP_DATA_DIR)

  backendProc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, APP_DATA_DIR },
    stdio: 'pipe',
  })

  backendProc.stdout?.on('data', (d: Buffer) =>
    process.stdout.write('[API] ' + d.toString()))
  backendProc.stderr?.on('data', (d: Buffer) =>
    process.stderr.write('[API] ' + d.toString()))
  backendProc.on('close', (code) => {
    console.log('[Backend] Exited with code', code)
    backendProc = null
  })
  backendProc.on('error', (err) => {
    console.error('[Backend] Failed to start:', err.message)
    backendProc = null
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (app.isPackaged) {
        dialog.showErrorBox(
          'Бэкенд не найден',
          `Не удалось запустить backend.exe:\n${cmd}\n\nФайл мог не попасть в сборку. Пересоберите приложение командой build.bat.`,
        )
      } else {
        dialog.showErrorBox(
          'Бэкенд не найден',
          `Python не найден по пути:\n${cmd}\n\nПроверьте, что venv создан:\n  cd services/api\n  python -m venv .venv\n  .venv\\Scripts\\pip install -r requirements.txt`,
        )
      }
    }
  })
}

/** Polls /health until the backend responds or timeout is reached. */
async function waitForBackend(maxMs = 20000, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (await isBackendRunning()) return true
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return false
}

/** Kill the backend process on app quit. */
function stopBackend(): void {
  if (backendProc && !backendProc.killed) {
    console.log('[Backend] Stopping process...')
    backendProc.kill()
    backendProc = null
  }
}

// ── Loading screen HTML ───────────────────────────────────────────────────────

const LOADING_HTML = `data:text/html;charset=utf-8,<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0f0f13;
    color: #888;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 16px;
    -webkit-app-region: drag;
  }
  .dot-row { display: flex; gap: 8px; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #4f46e5;
    animation: bounce 1.2s infinite ease-in-out;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }
  p { font-size: 13px; }
</style></head>
<body>
  <div class="dot-row"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
  <p>Запуск бэкенда...</p>
</body>
</html>`

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadWithRetry(win: BrowserWindow, url: string, attempts = 10, delayMs = 400): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await win.loadURL(url)
      return
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('ERR_CONNECTION_REFUSED') && i < attempts - 1) {
        await new Promise(r => setTimeout(r, delayMs))
      } else {
        throw err
      }
    }
  }
}

function broadcastUpdaterState(): void {
  if (!win) return
  win.webContents.send('updates:state', updaterState)
}

function setUpdaterState(patch: Partial<UpdaterState>): void {
  updaterState = {
    ...updaterState,
    ...patch,
    currentVersion: app.getVersion(),
  }
  broadcastUpdaterState()
}

async function setupAutoUpdater(): Promise<void> {
  if (!app.isPackaged) {
    setUpdaterState({ status: 'unsupported', message: 'Auto update disabled in dev mode' })
    return
  }

  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdaterRef = autoUpdater as typeof autoUpdaterRef
    if (!autoUpdaterRef) {
      setUpdaterState({ status: 'unsupported', message: 'Updater unavailable' })
      return
    }

    autoUpdaterRef.autoDownload = false

    autoUpdaterRef.on('checking-for-update', () => {
      setUpdaterState({ status: 'checking', message: 'Проверка обновлений…', checkedAt: new Date().toISOString() })
    })

    autoUpdaterRef.on('update-available', (info: unknown) => {
      const ver = typeof info === 'object' && info && 'version' in info
        ? String((info as { version: unknown }).version)
        : null
      setUpdaterState({
        status: 'available',
        availableVersion: ver,
        progress: 0,
        message: ver ? `Доступна версия ${ver}` : 'Доступно обновление',
      })
    })

    autoUpdaterRef.on('update-not-available', () => {
      setUpdaterState({
        status: 'not-available',
        availableVersion: null,
        progress: 0,
        message: 'Установлена последняя версия',
      })
    })

    autoUpdaterRef.on('download-progress', (progressObj: unknown) => {
      const percent = typeof progressObj === 'object' && progressObj && 'percent' in progressObj
        ? Number((progressObj as { percent: unknown }).percent)
        : 0
      setUpdaterState({
        status: 'downloading',
        progress: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
        message: 'Загрузка обновления…',
      })
    })

    autoUpdaterRef.on('update-downloaded', (info: unknown) => {
      const ver = typeof info === 'object' && info && 'version' in info
        ? String((info as { version: unknown }).version)
        : updaterState.availableVersion
      setUpdaterState({
        status: 'downloaded',
        availableVersion: ver,
        progress: 100,
        message: ver ? `Обновление ${ver} готово к установке` : 'Обновление готово к установке',
      })
    })

    autoUpdaterRef.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Updater] Error:', msg)
      setUpdaterState({ status: 'error', message: msg })
    })

    // Background check shortly after startup
    setTimeout(() => {
      void autoUpdaterRef?.checkForUpdates()
    }, 5000)
  } catch {
    autoUpdaterRef = null
    setUpdaterState({ status: 'unsupported', message: 'Updater not configured' })
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(): void {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const saved = readWindowState()

  // Clamp saved position to visible screen area (handles multi-monitor changes)
  const winWidth  = saved.width  ?? 420
  const winHeight = saved.height ?? 680
  const winX = saved.x != null ? Math.min(Math.max(saved.x, 0), sw - winWidth)  : sw - winWidth  - 20
  const winY = saved.y != null ? Math.min(Math.max(saved.y, 0), sh - winHeight) : 40

  win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 340,
    minHeight: 300,
    x: winX,
    y: winY,
    frame: false,
    transparent: false,
    alwaysOnTop: isPinned,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#0f0f13',
    icon: createAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isPinned) win.setAlwaysOnTop(true, 'screen-saver')

  // Show loading screen immediately, then load real URL once backend is ready
  win.loadURL(LOADING_HTML)

  // Save position on move / resize (debounced 500 ms)
  const debouncedSave = () => {
    if (saveStateTimeout) clearTimeout(saveStateTimeout)
    saveStateTimeout = setTimeout(saveWindowState, 500)
  }
  win.on('moved',   debouncedSave)
  win.on('resized', debouncedSave)

  // Hide to tray instead of closing (save state first)
  win.on('close', (e) => {
    saveWindowState()
    if (!app.isQuitting) {
      e.preventDefault()
      win?.hide()
    }
  })

  // Push maximize/restore state to renderer so the button icon updates
  win.on('maximize', () => win?.webContents.send('maximize-changed', true))
  win.on('unmaximize', () => win?.webContents.send('maximize-changed', false))
}

async function loadApp(): Promise<void> {
  if (!win) return
  if (VITE_DEV_SERVER_URL) {
    await loadWithRetry(win, VITE_DEV_SERVER_URL)
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray(): void {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('TG Focus Filter')

  const updateMenu = () => {
    const openAtLogin = app.getLoginItemSettings().openAtLogin
    const menu = Menu.buildFromTemplate([
      {
        label: win?.isVisible() ? 'Скрыть' : 'Показать',
        click: () => (win?.isVisible() ? win.hide() : win?.show()),
      },
      {
        label: isPinned ? '📌 Открепить' : '📌 Закрепить поверх',
        click: () => {
          isPinned = !isPinned
          if (win) {
            win.setAlwaysOnTop(isPinned, 'screen-saver')
            win.webContents.send('pin-changed', isPinned)
          }
          updateMenu()
        },
      },
      { type: 'separator' },
      {
        label: openAtLogin ? '✓ Запускать с Windows' : 'Запускать с Windows',
        click: () => {
          app.setLoginItemSettings({ openAtLogin: !openAtLogin })
          updateMenu()
        },
      },
      { type: 'separator' },
      {
        label: 'Выйти',
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ])
    tray?.setContextMenu(menu)
  }

  updateMenu()

  tray.on('click', () => {
    if (win?.isVisible()) win.hide()
    else { win?.show(); win?.focus() }
  })
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => win?.minimize())
ipcMain.on('window:close', () => win?.hide())
ipcMain.on('window:toggle-pin', () => {
  isPinned = !isPinned
  if (win) {
    win.setAlwaysOnTop(isPinned, 'screen-saver')
    win.webContents.send('pin-changed', isPinned)
  }
})
ipcMain.handle('window:get-pin', () => isPinned)
ipcMain.on('app:set-sound',          (_event, enabled: boolean) => { soundEnabled = enabled })
ipcMain.on('app:set-notifications',  (_event, enabled: boolean) => { notificationsEnabled = enabled })
ipcMain.handle('app:get-version', () => app.getVersion())
ipcMain.on('shell:open-external', (_event, url: string) => { void shell.openExternal(url) })
ipcMain.on('window:toggle-maximize', () => {
  if (win?.isMaximized()) win.unmaximize()
  else win?.maximize()
})
ipcMain.handle('window:get-maximized', () => win?.isMaximized() ?? false)
ipcMain.on('app:quit', () => {
  app.isQuitting = true
  app.quit()
})

ipcMain.on('app:open-logs-folder', () => {
  const logsDir = path.join(APP_DATA_DIR, 'logs')
  void shell.openPath(logsDir)
})

ipcMain.handle('updates:get-state', () => updaterState)

ipcMain.handle('updates:check', async () => {
  if (!autoUpdaterRef) {
    setUpdaterState({ status: 'unsupported', message: 'Updater unavailable in this build' })
    return updaterState
  }
  try {
    await autoUpdaterRef.checkForUpdates()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    setUpdaterState({ status: 'error', message: msg })
  }
  return updaterState
})

ipcMain.handle('updates:download', async () => {
  if (!autoUpdaterRef) {
    setUpdaterState({ status: 'unsupported', message: 'Updater unavailable in this build' })
    return updaterState
  }
  try {
    setUpdaterState({ status: 'downloading', progress: 0, message: 'Загрузка обновления…' })
    await autoUpdaterRef.downloadUpdate()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    setUpdaterState({ status: 'error', message: msg })
  }
  return updaterState
})

ipcMain.on('updates:install', () => {
  if (!autoUpdaterRef) return
  autoUpdaterRef.quitAndInstall()
})

ipcMain.handle('dialog:confirm', async (_event, message: string) => {
  if (!win) return false
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Отмена', 'Подтвердить'],
    defaultId: 1,
    cancelId: 0,
    message,
    noLink: true,
  })
  return result.response === 1
})

ipcMain.on('app:notify', (_event, { title, body }: { title: string; body: string }) => {
  // Don't distract if the window is visible and focused
  if (win?.isFocused()) return

  if (!notificationsEnabled) return
  if (!Notification.isSupported()) return

  const n = new Notification({
    title,
    body,
    icon: createAppIcon(),
    silent: !soundEnabled,
  })

  // Clicking notification → show and focus the window
  n.on('click', () => {
    win?.show()
    win?.focus()
    if (isPinned) win?.setAlwaysOnTop(true, 'screen-saver')
  })

  n.show()
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // 0. Set Windows App User Model ID — required for correct taskbar icon grouping
  //    and association between the exe icon and the running window.
  app.setAppUserModelId('com.tgfocusfilter.app')

  // 0. Resolve user-data dir and prepare it for first run
  APP_DATA_DIR = app.getPath('userData')
  ensureUserDataDir()

  // 0a. File logging (redirects console output to logs/app-DATE.log)
  initFileLogging()
  console.log(`[App] Starting v${app.getVersion()} | packaged=${app.isPackaged} | userData=${APP_DATA_DIR}`)

  // 1. Show window immediately with loading screen
  createWindow()
  createTray()

  // 2. Start backend (skip if already running — e.g. user launched manually)
  const alreadyRunning = await isBackendRunning()
  if (alreadyRunning) {
    console.log('[Backend] Already running — skipping auto-start')
  } else {
    startBackend()
  }

  // 3. Load the React app immediately — it handles "backend not ready" gracefully
  //    (shows a connecting screen internally and retries automatically)
  await loadApp()

  // 4. Configure updater API and background update checks
  await setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else win?.show()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') app.quit()
})

// Kill backend when app quits
app.on('will-quit', () => {
  stopBackend()
})

// ── Type augmentation ─────────────────────────────────────────────────────────

declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean
    }
  }
}
