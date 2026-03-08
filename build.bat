@echo off
setlocal EnableExtensions EnableDelayedExpansion
:: ---------------------------------------------------------
::  TG Focus Filter - build script
::  Usage:
::    build.bat                          -> interactive mode
::    build.bat portable                 -> portable .exe only
::    build.bat nsis                     -> NSIS installer only
::    build.bat all|both                 -> portable + nsis
::    build.bat all patch|minor|major    -> bump version + build
::    build.bat all 0.1.1                -> set exact version
::    build.bat all none                 -> build without version bump
::    build.bat all patch release        -> bump + build + publish to GitHub
:: ---------------------------------------------------------

set "TARGET=%~1"
set "BUMP=%~2"
set "PUBLISH_FLAG=%~3"
if /I "%TARGET%"=="both" set "TARGET=all"

if "%TARGET%"=="" (
    echo.
    echo ================================================
    echo  TG Focus Filter - Select build target
    echo ================================================
    echo  [1] Portable ^(.exe^)
    echo  [2] Installer ^(NSIS^)
    echo  [3] Both ^(portable + nsis^) [default]
    echo.
    set /p CHOICE=Select option [1/2/3]: 

    if "!CHOICE!"=="1" (
        set "TARGET=portable"
    ) else if "!CHOICE!"=="2" (
        set "TARGET=nsis"
    ) else (
        set "TARGET=all"
    )
)

for /f "usebackq delims=" %%v in (`node -p "require('./apps/desktop/package.json').version" 2^>nul`) do set "CURRENT_VERSION=%%v"
if "%CURRENT_VERSION%"=="" set "CURRENT_VERSION=unknown"

if "%BUMP%"=="" (
    echo Current version: %CURRENT_VERSION%
    echo.
    echo ================================================
    echo  Version bump before build
    echo ================================================
    echo  [1] No change
    echo  [2] Patch ^(x.y.Z^) [Recommended]
    echo  [3] Minor ^(x.Y.0^)
    echo  [4] Major ^(X.0.0^)
    echo  [5] Enter manually
    echo.
    set /p BUMP_CHOICE=Select option [1/2/3/4/5]: 

    if "!BUMP_CHOICE!"=="2" (
        set "BUMP=patch"
    ) else if "!BUMP_CHOICE!"=="3" (
        set "BUMP=minor"
    ) else if "!BUMP_CHOICE!"=="4" (
        set "BUMP=major"
    ) else if "!BUMP_CHOICE!"=="5" (
        set /p CUSTOM_VERSION=Enter version ^(e.g. 0.1.1^): 
        set "BUMP=!CUSTOM_VERSION!"
    ) else (
        set "BUMP=none"
    )
)

if "%PUBLISH_FLAG%"=="" (
    echo.
    echo ================================================
    echo  Publish release to GitHub?
    echo ================================================
    echo  [1] No - local build only [default]
    echo  [2] Yes - upload to GitHub Releases ^(needs GH_TOKEN^)
    echo.
    set /p PUB_CHOICE=Select option [1/2]: 

    if "!PUB_CHOICE!"=="2" (
        set "PUBLISH_FLAG=release"
    ) else (
        set "PUBLISH_FLAG=local"
    )
)

if /I "%BUMP%"=="no"   set "BUMP=none"
if /I "%BUMP%"=="skip" set "BUMP=none"

if /I not "%TARGET%"=="portable" if /I not "%TARGET%"=="nsis" if /I not "%TARGET%"=="all" (
    echo.
    echo [ERROR] Unknown build target: "%TARGET%"
    echo Valid values: portable, nsis, all, both
    pause
    exit /b 1
)

if "%BUMP%"=="" (
    echo.
    echo [ERROR] Version mode not selected.
    pause
    exit /b 1
)

:: Check GH_TOKEN if publishing
if /I "%PUBLISH_FLAG%"=="release" (
    if "%GH_TOKEN%"=="" (
        echo.
        echo [ERROR] GH_TOKEN environment variable is not set.
        echo Set it before running: set GH_TOKEN=your_token_here
        pause
        exit /b 1
    )
    echo [INFO] GH_TOKEN found - will publish to GitHub Releases.
)

if /I not "%BUMP%"=="none" (
    echo.
    echo [INFO] Bumping version: %CURRENT_VERSION% -^> %BUMP%
    pushd "%~dp0apps\desktop"
    call npm version "%BUMP%" --no-git-tag-version
    if errorlevel 1 (
        popd
        echo.
        echo [ERROR] Failed to bump version.
        pause
        exit /b 1
    )
    popd
    for /f "usebackq delims=" %%v in (`node -p "require('./apps/desktop/package.json').version" 2^>nul`) do set "CURRENT_VERSION=%%v"
    echo [OK] New version: %CURRENT_VERSION%
) else (
    echo [INFO] Version unchanged: %CURRENT_VERSION%
)

echo.
echo [INFO] Build target : %TARGET%
echo [INFO] Version      : %CURRENT_VERSION%
if /I "%PUBLISH_FLAG%"=="release" (
    echo [INFO] Publish      : GitHub Releases
) else (
    echo [INFO] Publish      : local only
)
echo.

if /I "%PUBLISH_FLAG%"=="release" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" -Target "%TARGET%" -Publish
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" -Target "%TARGET%"
)

if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

pause
