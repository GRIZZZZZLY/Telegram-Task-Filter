# Build script: TG Focus Filter desktop app -> Windows .exe
# Usage (from project root):
#   .\scripts\build.ps1
#   .\scripts\build.ps1 -Target portable      # only portable .exe
#   .\scripts\build.ps1 -Target nsis          # only NSIS installer
param(
    [ValidateSet('all', 'portable', 'nsis')]
    [string]$Target = 'all'
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DesktopDir  = Join-Path $ProjectRoot 'apps\desktop'
$ApiDir      = Join-Path $ProjectRoot 'services\api'
$VenvPython  = Join-Path $ApiDir '.venv\Scripts\python.exe'
$VenvPip     = Join-Path $ApiDir '.venv\Scripts\pip.exe'
$VenvPyInst  = Join-Path $ApiDir '.venv\Scripts\pyinstaller.exe'

Write-Host ''
Write-Host '=======================================' -ForegroundColor Cyan
Write-Host '  TG Focus Filter - Desktop Build'      -ForegroundColor Cyan
Write-Host '=======================================' -ForegroundColor Cyan
Write-Host "  Project root : $ProjectRoot"
Write-Host "  Desktop dir  : $DesktopDir"
Write-Host "  Target       : $Target"
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
Push-Location $DesktopDir
try {
    if ($Target -eq 'portable') {
        npx electron-builder --win --config.win.target=portable
    } elseif ($Target -eq 'nsis') {
        npx electron-builder --win --config.win.target=nsis
    } else {
        # 'all' — build both targets as defined in package.json
        npx electron-builder --win
    }
    if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }
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
