@echo off
:: ─────────────────────────────────────────────────────
::  TG Focus Filter — быстрая сборка .exe
::  Использование:
::    build.bat            → portable + nsis
::    build.bat portable   → только portable .exe
::    build.bat nsis       → только NSIS-установщик
:: ─────────────────────────────────────────────────────

set TARGET=%~1
if "%TARGET%"=="" set TARGET=portable

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" -Target %TARGET%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ОШИБКА] Сборка завершилась с ошибкой. Код: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

pause
