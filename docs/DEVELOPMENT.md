# Development Guide

## Requirements

| Tool | Version |
|---|---|
| Python | 3.13 |
| Node.js | v24 |
| npm | 10+ |
| Windows | 10/11 x64 |

---

## Initial setup

```powershell
git clone <repo-url> D:\Telegram-Task-Filter
cd D:\Telegram-Task-Filter
```

### Backend env

```powershell
cd services\api
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\pip install pyinstaller
```

### Desktop deps

```powershell
cd ..\..\apps\desktop
npm install
```

---

## Dev run

### Backend

```powershell
cd services\api
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8787
```

### Desktop

```powershell
cd apps\desktop
npm run dev
```

---

## Tests

```powershell
D:\Telegram-Task-Filter\services\api\.venv\Scripts\python.exe -m pytest services\api\tests\ -q
```

Core checks used in CI/local smoke:

```powershell
npm run build
D:\Telegram-Task-Filter\services\api\.venv\Scripts\python.exe -m pytest services\api\tests\test_tasks.py -q
D:\Telegram-Task-Filter\services\api\.venv\Scripts\python.exe -m pytest services\api\tests\test_stats.py -q
```

---

## Build and versioning

`build.bat` is the main entrypoint.

Supported modes:

```powershell
build.bat
build.bat portable
build.bat nsis
build.bat all
build.bat all patch
build.bat all minor
build.bat all major
build.bat all 0.2.0
build.bat all none
```

What it does:

1. optional version bump in `apps/desktop/package.json`
2. backend PyInstaller build (`services/api/dist/backend`)
3. desktop `npm run build`
4. `electron-builder` packaging (portable/nsis/all)

Artifacts:

- `apps/desktop/release/TG-Focus-Filter-<version>-portable.exe`
- `apps/desktop/release/TG-Focus-Filter-<version>-setup.exe`

---

## Release process (short)

1. bump version (`build.bat all patch` or manual semver)
2. commit
3. create tag `vX.Y.Z`
4. push tag
5. GitHub Actions workflow `.github/workflows/release.yml` publishes release

See full details in `docs/RELEASE_AND_UPDATES.md`.

---

## Notes

- Backend logs now use UTC tag in file output (`... UTC INFO ...`)
- UI renders time in device timezone
- Auto-update is intended for NSIS-installed app; portable is manual update
