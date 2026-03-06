# Desktop App (Electron + React)

UI client for TG Focus Filter.

## Commands

```powershell
npm run dev
npm run build
npm run electron:preview
npm run electron:build
```

## Main folders

- `electron/main.ts` — Electron main process, backend spawn, tray, updater IPC
- `electron/preload.ts` — secure bridge (`window.electronAPI`)
- `src/components` — UI screens and widgets
- `src/hooks` — app/task/state hooks
- `src/api` — backend API clients

## Notes

- time in UI is rendered in device timezone
- links to Telegram use deep links (`tg://`) in Electron mode
- updates UI is available in Settings (for NSIS installs)
