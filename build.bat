@echo off
setlocal
title MyMd Build Script

rem ============================================================
rem  MyMd Auto Build Script
rem  - Bumps version (patch by default) across package.json,
rem    src-tauri/Cargo.toml, src-tauri/Cargo.lock and
rem    src-tauri/tauri.conf.json
rem  - Runs tauri build with --no-bundle: standalone exe only
rem    (no NSIS/MSI installer), then renames the exe to
rem    MyMdEdit-v<version>.exe
rem
rem  Usage:
rem    build.bat              -> patch bump  (1.0.0 -> 1.0.1)
rem    build.bat minor        -> minor bump  (1.0.0 -> 1.1.0)
rem    build.bat major        -> major bump  (1.0.0 -> 2.0.0)
rem    build.bat no           -> no bump, just build
rem ============================================================

set "ROOT=%~dp0"
if not exist "%ROOT%output" mkdir "%ROOT%output"
set "BUMP=patch"
if /I "%~1"=="minor" set "BUMP=minor"
if /I "%~1"=="major" set "BUMP=major"
if /I "%~1"=="no" set "BUMP=no"

echo.
echo ============================================
echo   MyMd Build  (bump: %BUMP%)
echo ============================================
echo.

rem ---- Step 1: version bump + backup + build marker + stale exe removal ----
rem Logic lives in a .cjs file: cmd.exe mangles long inline node payloads.
rem The script backs up all four version files first so :fail can roll back.
set "MYMDEDIT_ROOT=%ROOT%"
set "MYMDEDIT_BUMP=%BUMP%"
node "%ROOT%scripts\bump-version.cjs"
if errorlevel 1 goto :fail

rem ---- Step 2: build ----
echo.
echo [2/3] Building release binary (standalone exe, no installer)...
echo.
rem Frontend build is handled by beforeBuildCommand in tauri.conf.json
rem (npm run build). pnpm is not installed on this machine, so use the
rem repo-local tauri CLI instead of any global package manager.
set "TAURI=%ROOT%node_modules\.bin\tauri.cmd"
if not exist "%TAURI%" (
    echo [ERROR] tauri CLI not found at %TAURI%
    echo         Run npm install first.
    goto :fail
)
call "%TAURI%" build --no-bundle
if errorlevel 1 goto :fail

rem ---- Step 3: rename exe to include version ----
echo.
echo [3/3] Renaming exe to include version...
echo.
set "MYMDEDIT_ROOT=%ROOT%"
node "%ROOT%scripts\rename-exe.cjs"
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   Build finished successfully!
echo ============================================
echo.
echo Output dir: output\MyMd-vX.Y.Z.exe (standalone, no installer. See Step [3/3] output.)
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Build failed. See messages above.
echo.
rem Restore package.json / Cargo.toml / Cargo.lock / tauri.conf.json.
rem Without this the version stays bumped after a failure and a retry bumps
rem again, so the published version no longer matches the binary.
set "MYMDEDIT_ROOT=%ROOT%"
node "%ROOT%scripts\version-rollback.cjs"
pause
exit /b 1
