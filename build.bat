@echo off
setlocal EnableExtensions
:: ─────────────────────────────────────────────────────
::  TG Focus Filter — быстрая сборка .exe
::  Использование:
::    build.bat            → спросить цель сборки (по умолчанию обе)
::    build.bat portable   → только portable .exe
::    build.bat nsis       → только NSIS-установщик
::    build.bat all|both   → portable + nsis
:: ─────────────────────────────────────────────────────

set "TARGET=%~1"
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

if /I not "%TARGET%"=="portable" if /I not "%TARGET%"=="nsis" if /I not "%TARGET%"=="all" (
    echo.
    echo [ОШИБКА] Неизвестная цель сборки: "%TARGET%"
    echo Допустимые значения: portable, nsis, all, both
    pause
    exit /b 1
)

echo.
echo [INFO] Цель сборки: %TARGET%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" -Target "%TARGET%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ОШИБКА] Сборка завершилась с ошибкой. Код: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

pause
