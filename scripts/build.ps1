# Build script: TG Focus Filter desktop app -> Windows .exe
# Usage (from project root):
#   .\scripts\build.ps1
#   .\scripts\build.ps1 -Target portable      # only portable .exe
#   .\scripts\build.ps1 -Target nsis          # only NSIS installer
param(
    [ValidateSet('all', 'portable', 'nsis')]
    [string]$Target = 'all',

    # Pass -Publish to upload artifacts to GitHub Releases.
    # Requires GH_TOKEN env var to be set.
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DesktopDir  = Join-Path $ProjectRoot 'apps\desktop'
$ApiDir      = Join-Path $ProjectRoot 'services\api'
$VenvPython  = Join-Path $ApiDir '.venv\Scripts\python.exe'
$VenvPip     = Join-Path $ApiDir '.venv\Scripts\pip.exe'
$VenvPyInst  = Join-Path $ApiDir '.venv\Scripts\pyinstaller.exe'

function Stop-BuildLocks {
    Write-Host '  Stopping running app processes that may lock artifacts...' -ForegroundColor Gray
    # Use Stop-Process with SilentlyContinue so missing processes do not fail the build.
    Get-Process -Name "TG Focus Filter", "backend" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

function Clean-ReleaseArtifacts {
    param([string]$ReleaseDir)

    if (-not (Test-Path $ReleaseDir)) {
        return
    }

    # Remove stale intermediate outputs that are frequently involved in lock issues
    # when NSIS/7zip packaging is re-run.
    $pathsToRemove = @(
        (Join-Path $ReleaseDir 'win-unpacked'),
        (Join-Path $ReleaseDir '*.nsis.7z'),
        (Join-Path $ReleaseDir 'builder-debug.yml'),
        (Join-Path $ReleaseDir 'builder-effective-config.yaml')
    )

    foreach ($p in $pathsToRemove) {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ''
Write-Host '=======================================' -ForegroundColor Cyan
Write-Host '  TG Focus Filter - Desktop Build'      -ForegroundColor Cyan
Write-Host '=======================================' -ForegroundColor Cyan
Write-Host "  Project root : $ProjectRoot"
Write-Host "  Desktop dir  : $DesktopDir"
Write-Host "  Target       : $Target"
Write-Host "  Publish      : $(if ($Publish) { 'YES (GitHub Release)' } else { 'no' })"
Write-Host ''

# -- 1. Check Node -------------------------------------------------------
Write-Host '[1/5] Checking Node.js...' -ForegroundColor Yellow
node --version
if ($LASTEXITCODE -ne 0) { Write-Error 'Node.js not found. Install Node.js 18+ and retry.' }

# -- 2. Build Python backend (PyInstaller) --------------------------------
Write-Host '[2/5] Building Python backend with PyInstaller...' -ForegroundColor Yellow
if (-not (Test-Path $VenvPython)) {
    Write-Error "Python venv not found at $VenvPython`nRun: cd services\api && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt"
}
# Install PyInstaller if not already present
if (-not (Test-Path $VenvPyInst)) {
    Write-Host '  Installing PyInstaller...' -ForegroundColor Gray
    & $VenvPip install pyinstaller --quiet
    if ($LASTEXITCODE -ne 0) { throw 'pip install pyinstaller failed' }
}
Push-Location $ApiDir
try {
    & $VenvPyInst backend.spec --distpath dist --workpath build --noconfirm
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller build failed' }
    Write-Host '  Backend built -> services/api/dist/backend/' -ForegroundColor Green
} finally { Pop-Location }

# -- 3. Install / update npm deps ----------------------------------------
Write-Host '[3/5] Installing npm dependencies...' -ForegroundColor Yellow
Push-Location $DesktopDir
try {
    npm install --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
} finally { Pop-Location }

# -- 4. TypeScript + Vite build ------------------------------------------
Write-Host '[4/5] Building TypeScript + Vite...' -ForegroundColor Yellow
Push-Location $DesktopDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
} finally { Pop-Location }

# -- 5. electron-builder packaging ---------------------------------------
Write-Host '[5/5] Packaging with electron-builder...' -ForegroundColor Yellow

# Validate GH_TOKEN when publishing
if ($Publish) {
    if (-not $env:GH_TOKEN) {
        Write-Error 'GH_TOKEN environment variable is not set. Cannot publish to GitHub Releases.'
    }
    Write-Host '  GH_TOKEN found, will publish to GitHub Releases.' -ForegroundColor Green
}

$publishFlag = if ($Publish) { 'always' } else { 'never' }

Push-Location $DesktopDir
try {
    $ReleaseDir = Join-Path $DesktopDir 'release'
    Stop-BuildLocks
    Clean-ReleaseArtifacts -ReleaseDir $ReleaseDir

    if ($Target -eq 'portable') {
        npx electron-builder --win --config.win.target=portable --publish $publishFlag
    } elseif ($Target -eq 'nsis') {
        npx electron-builder --win --config.win.target=nsis --publish $publishFlag
    } else {
        npx electron-builder --win --publish $publishFlag
    }
    if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }

    # Generate app-update.yml inside the NSIS-installed app resources so that
    # electron-updater can find the GitHub feed even when built with --publish never.
    # The file is embedded into the installer via extraResources at build time,
    # so we write it to the win-unpacked resources dir before packaging finishes.
    # electron-builder already writes it there when --publish always is used;
    # we replicate the same file for --publish never builds.
    if ($Target -ne 'portable') {
        $updateYmlPath = Join-Path $ReleaseDir 'win-unpacked\resources\app-update.yml'
        if (-not (Test-Path $updateYmlPath)) {
            $version = (Get-Content (Join-Path $DesktopDir 'package.json') | ConvertFrom-Json).version
            $updateYml = @"
provider: github
owner: GRIZZZZZLY
repo: Telegram-Task-Filter
updaterCacheDirName: tg-focus-filter-updater
"@
            Set-Content -Path $updateYmlPath -Value $updateYml -Encoding UTF8
            Write-Host "  Generated app-update.yml -> $updateYmlPath" -ForegroundColor Green
        } else {
            Write-Host "  app-update.yml already present (publish always was used)" -ForegroundColor Gray
        }
    }
} finally { Pop-Location }

# -- Done ----------------------------------------------------------------
$ReleaseDir = Join-Path $DesktopDir 'release'
Write-Host ''
Write-Host 'Build complete!' -ForegroundColor Green
Write-Host "  Output: $ReleaseDir" -ForegroundColor Green
Write-Host ''
Get-ChildItem $ReleaseDir -Filter '*.exe' -ErrorAction SilentlyContinue |
    ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1048576, 1)
        Write-Host "  -> $($_.Name)  ($sizeMB MB)"
    }
Write-Host ''
