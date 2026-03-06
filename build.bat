@echo off
setlocal EnableExtensions
:: ─────────────────────────────────────────────────────
::  TG Focus Filter — быстрая сборка .exe
::  Использование:
::    build.bat                            → спросить цель + bump версии
::    build.bat portable                   → только portable .exe
::    build.bat nsis                       → только NSIS-установщик
::    build.bat all|both                   → portable + nsis
::    build.bat all patch|minor|major      → неинтерактивный bump
::    build.bat all 0.1.1                  → установить точную версию
::    build.bat all none                   → без изменения версии
:: ─────────────────────────────────────────────────────

set "TARGET=%~1"
set "BUMP=%~2"
if /I "%TARGET%"=="both" set "TARGET=all"

if "%TARGET%"=="" (
    echo.
    echo ================================================
    echo  TG Focus Filter - Выбор цели сборки
    echo ================================================
    echo  [1] Portable ^(.exe^)
    echo  [2] Installer ^(NSIS^)
    echo  [3] Обе версии ^(portable + nsis^) [по умолчанию]
    echo.
    set /p CHOICE=Выберите вариант [1/2/3]: 

    if "%CHOICE%"=="1" (
        set "TARGET=portable"
    ) else if "%CHOICE%"=="2" (
        set "TARGET=nsis"
    ) else (
        set "TARGET=all"
    )
)

for /f "usebackq delims=" %%v in (`node -p "require('./apps/desktop/package.json').version" 2^>nul`) do set "CURRENT_VERSION=%%v"
if "%CURRENT_VERSION%"=="" set "CURRENT_VERSION=unknown"

if "%BUMP%"=="" (
    echo Текущая версия: %CURRENT_VERSION%
    echo.
    echo ================================================
    echo  Изменение версии перед сборкой
    echo ================================================
    echo  [1] Без изменения
    echo  [2] Patch ^(x.y.Z^) [Recommended]
    echo  [3] Minor ^(x.Y.0^)
    echo  [4] Major ^(X.0.0^)
    echo  [5] Указать вручную
    echo.
    set /p BUMP_CHOICE=Выберите вариант [1/2/3/4/5]: 

    if "%BUMP_CHOICE%"=="2" (
        set "BUMP=patch"
    ) else if "%BUMP_CHOICE%"=="3" (
        set "BUMP=minor"
    ) else if "%BUMP_CHOICE%"=="4" (
        set "BUMP=major"
    ) else if "%BUMP_CHOICE%"=="5" (
        set /p CUSTOM_VERSION=Введите версию ^(пример 0.1.1^): 
        set "BUMP=%CUSTOM_VERSION%"
    ) else (
        set "BUMP=none"
    )
)

if /I "%BUMP%"=="no" set "BUMP=none"
if /I "%BUMP%"=="skip" set "BUMP=none"

if /I not "%TARGET%"=="portable" if /I not "%TARGET%"=="nsis" if /I not "%TARGET%"=="all" (
    echo.
    echo [ОШИБКА] Неизвестная цель сборки: "%TARGET%"
    echo Допустимые значения: portable, nsis, all, both
    pause
    exit /b 1
)

if "%BUMP%"=="" (
    echo.
    echo [ОШИБКА] Не выбран режим версии.
    pause
    exit /b 1
)

if /I not "%BUMP%"=="none" (
    echo.
    echo [INFO] Обновляю версию: %CURRENT_VERSION% -> %BUMP%
    pushd "%~dp0apps\desktop"
    call npm version "%BUMP%" --no-git-tag-version
    set "VERSION_RC=%ERRORLEVEL%"
    popd
    if %VERSION_RC% NEQ 0 (
        echo.
        echo [ОШИБКА] Не удалось обновить версию. Код: %VERSION_RC%
        pause
        exit /b %VERSION_RC%
    )
    for /f "usebackq delims=" %%v in (`node -p "require('./apps/desktop/package.json').version" 2^>nul`) do set "CURRENT_VERSION=%%v"
    echo [OK] Новая версия: %CURRENT_VERSION%
) else (
    echo [INFO] Версия не изменена: %CURRENT_VERSION%
)

echo.
echo [INFO] Цель сборки: %TARGET%
echo [INFO] Версия: %CURRENT_VERSION%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" -Target "%TARGET%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ОШИБКА] Сборка завершилась с ошибкой. Код: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

pause
