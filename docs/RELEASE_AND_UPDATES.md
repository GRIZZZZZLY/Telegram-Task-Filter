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
6. build installer/update metadata via electron-builder (`--publish never`)
7. upload update feed to S3
8. create GitHub release entry
9. upload artifacts to Actions

---

## Required GitHub settings

### Repository Actions permissions

`Settings -> Actions -> General -> Workflow permissions`

- set: **Read and write permissions**

### Repository Variables

`Settings -> Secrets and variables -> Actions -> Variables`

Required:

- `UPDATE_FEED_URL` — public HTTPS URL of your feed, e.g. `https://updates.example.com/stable`
- `S3_BUCKET` — bucket name, e.g. `tg-focus-filter-updates`
- `S3_PREFIX` — prefix/folder, e.g. `stable`

### Repository Secrets

Required for S3 upload:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Also used:

- `${{ secrets.GITHUB_TOKEN }}` for GitHub release entry

Optional later:

- code signing secrets (`CSC_*`)

---

## What you need to prepare manually

Yes — before first real release you need to prepare infrastructure.

### 1. AWS account

You need an AWS account (or compatible S3 provider).

### 2. S3 bucket for updates

Create bucket, for example:

- `tg-focus-filter-updates`

Recommended structure:

```text
s3://tg-focus-filter-updates/
  stable/
    latest.yml
    TG-Focus-Filter-0.2.1-setup.exe
    TG-Focus-Filter-0.2.1-setup.exe.blockmap
```

### 3. Public HTTPS URL for clients

Best options:

- CloudFront + custom domain, e.g. `https://updates.example.com/stable`
- or direct public S3 website/domain if acceptable

`UPDATE_FEED_URL` must point to the final public URL that contains `latest.yml`.

### 4. IAM user for GitHub Actions

Create a limited IAM user with permission to upload only to your update bucket/prefix.

Minimum practical actions:

- `s3:PutObject`
- `s3:DeleteObject` (optional but useful)
- `s3:ListBucket`

Scope it to the update bucket only.

### 5. GitHub repo settings

Add the repo variables and secrets listed above.

---

## Recommended S3 bucket policy shape

Public read should be limited to the update prefix only.

Example idea (adapt to your bucket/domain):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadUpdates",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::tg-focus-filter-updates/stable/*"
    }
  ]
}
```

Keep write access private via IAM only.

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
