@echo off
setlocal
title MyMdEdit Debug Build Script

rem ============================================================
rem  MyMdEdit Debug Build Script
rem  - Sets VITE_AUTO_DEVTOOLS=1 so the app auto-opens DevTools
rem    and captures global errors on startup
rem  - Builds a DEBUG executable (no version bump, no NSIS bundle)
rem
rem  Output: src-tauri\target\debug\mymdedit.exe
rem ============================================================

set "ROOT=%~dp0"
set "TAURI=%ROOT%node_modules\.bin\tauri.cmd"

echo.
echo ============================================
echo   MyMdEdit Debug Build (VITE_AUTO_DEVTOOLS=1)
echo ============================================
echo.

if not exist "%TAURI%" (
    echo [ERROR] tauri CLI not found at %TAURI%
    goto :fail
)

set VITE_AUTO_DEVTOOLS=1

echo [1/1] Building debug exe (no NSIS bundle)...
rem -f devtools: the devtools feature is off by default (release build has no
rem DevTools). Debug builds opt in explicitly so F12 still works while debugging.
call "%TAURI%" build --debug --no-bundle -f devtools
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   Debug build finished!
echo   Run: src-tauri\target\debug\mymdedit.exe
echo ============================================
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Debug build failed. See messages above.
echo.
pause
exit /b 1