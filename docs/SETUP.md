# Setup and First Run

## Install options

### Option A — NSIS installer (recommended)

1. Download `TG-Focus-Filter-*-setup.exe` from Releases
2. Install app
3. Launch TG Focus Filter

Why recommended:

- supports in-app auto-update flow
- standard uninstall via Windows apps list

### Option B — Portable

1. Download `TG-Focus-Filter-*-portable.exe`
2. Run directly

Portable limitation:

- update is manual (download new file)

---

## First run

On first start, app creates data directory:

```text
%APPDATA%\tg-focus-filter-desktop\
├── .env
├── sessions\
└── data\
```

Then complete Telegram auth in app UI.

Guide: `docs/AUTH_GUIDE.md`

---

## Basic post-install setup

1. Open **Settings**
2. Configure mention handles
3. Select monitored chats/threads
4. Save settings and apply listener restart when required

---

## App updates

For NSIS-installed app:

`Settings -> Обновления приложения`

- Check for updates
- Download update
- Restart and install

For portable app:

- manually download and replace executable

---

## Troubleshooting

- Backend not responding on startup:
  - restart app
  - check `%APPDATA%\tg-focus-filter-desktop\logs\`
- Wrong time in UI:
  - app uses device timezone, verify OS timezone settings
- Auth lost after reinstall:
  - verify `%APPDATA%\tg-focus-filter-desktop\sessions\user.session`
