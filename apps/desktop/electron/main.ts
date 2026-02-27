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
FILTER_STRICT_MENTIONS=false

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
      'FILTER_STRICT_MENTIONS=false',
      '',
      '# Auto-cleanup (0 = disabled)',
      'CLEANUP_DONE_AFTER_DAYS=0',
      '',
      '# UI',
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
let backendProc: ChildProcess | null = null

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

function createTrayIcon(): nativeImage {
  try { return nativeImage.createFromBuffer(makePng16(79, 70, 229)) }
  catch { return nativeImage.createEmpty() }
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

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(): void {
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize

  win = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 340,
    minHeight: 300,
    x: sw - 440,
    y: 40,
    frame: false,
    transparent: false,
    alwaysOnTop: isPinned,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#0f0f13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isPinned) win.setAlwaysOnTop(true, 'screen-saver')

  // Show loading screen immediately, then load real URL once backend is ready
  win.loadURL(LOADING_HTML)

  // Hide to tray instead of closing
  win.on('close', (e) => {
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
ipcMain.on('app:set-sound', (_event, enabled: boolean) => { soundEnabled = enabled })
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

ipcMain.on('app:notify', (_event, { title, body }: { title: string; body: string }) => {
  // Don't distract if the window is visible and focused
  if (win?.isFocused()) return

  if (!Notification.isSupported()) return

  const n = new Notification({
    title,
    body,
    icon: nativeImage.createFromBuffer(makePng16(79, 70, 229)),
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
  // 0. Resolve user-data dir and prepare it for first run
  APP_DATA_DIR = app.getPath('userData')
  ensureUserDataDir()

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
