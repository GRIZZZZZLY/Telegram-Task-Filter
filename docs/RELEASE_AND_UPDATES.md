# Release & Auto-Update

## Overview

Project uses `electron-builder` + `electron-updater`.

- NSIS installer: supports in-app update flow
- Portable build: manual update only

---

## Auto-update architecture

### Main process

Files:

- `apps/desktop/electron/main.ts`
- `apps/desktop/electron/preload.ts`

Main process exposes updater state via IPC:

- `updates:get-state`
- `updates:check`
- `updates:download`
- `updates:install`
- push channel: `updates:state`

State model:

- `idle`
- `unsupported`
- `checking`
- `available`
- `not-available`
- `downloading`
- `downloaded`
- `error`

### Renderer

Settings UI (`apps/desktop/src/components/settings/SettingsScreen.tsx`) has:

- check updates
- download update
- restart and install
- progress + status messages

---

## Release workflow (GitHub Actions)

File: `.github/workflows/release.yml`

Triggers:

- push tag `v*`
- manual `workflow_dispatch`

Pipeline:

1. checkout
2. setup Node + Python
3. validate tag version equals `apps/desktop/package.json` version
4. build backend via PyInstaller
5. build desktop (`npm run build`)
6. publish release via electron-builder (`--publish always`)
7. upload artifacts to Actions

---

## Required GitHub settings

### Repository Actions permissions

`Settings -> Actions -> General -> Workflow permissions`

- set: **Read and write permissions**

### Tokens/secrets

- workflow uses `${{ secrets.GITHUB_TOKEN }}` for release publish
- if code signing is needed later, add signing secrets (`CSC_*`)

---

## Versioning policy

- source of truth: `apps/desktop/package.json -> version`
- release tag format: `vX.Y.Z`
- tag and package version must match

Examples:

```powershell
build.bat all patch
git add -A
git commit -m "chore(release): bump to 0.2.1"
git tag v0.2.1
git push origin main --tags
```

---

## build.bat release usage

Supported:

```powershell
build.bat
build.bat all patch
build.bat nsis 0.2.0
build.bat portable none
```

- first arg: target (`portable|nsis|all`)
- second arg: bump (`none|patch|minor|major|<explicit-version>`)

---

## Private repository notes

Private repo can run Actions and produce releases.

Important: client auto-update access to private release assets usually needs auth.

Recommended options:

1. public GitHub Releases feed (simplest)
2. private repo + separate public update feed (S3/R2/static hosting)

Avoid embedding long-lived personal tokens inside desktop app.

---

## Rollback

Preferred rollback strategy:

- publish next patch release (`X.Y.Z+1`) with fix

Emergency:

- temporarily stop rollout by removing/replacing latest update metadata
