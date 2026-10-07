@echo off
setlocal
title MyMdEdit Build Script

rem ============================================================
rem  MyMdEdit Auto Build Script
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
echo   MyMdEdit Build  (bump: %BUMP%)
echo ============================================
echo.

rem ---- Step 1: version bump ----
set "MYMDEDIT_ROOT=%ROOT%"
set "MYMDEDIT_BUMP=%BUMP%"
node -e "const fs=require('fs');const root=process.env.MYMDEDIT_ROOT.replace(/[\\\/]$/,'')+'/';const bump=process.env.MYMDEDIT_BUMP;const tauri=JSON.parse(fs.readFileSync(root+'src-tauri/tauri.conf.json','utf8'));let [mj,mi,p]=tauri.version.split('.').map(Number);if(bump==='major'){mj++;mi=0;p=0}else if(bump==='minor'){mi++;p=0}else if(bump==='patch'){p++}const next=[mj,mi,p].join('.');console.log('[1/2] Version: '+tauri.version+' -> '+next);if(next===tauri.version){console.log('      No change, keeping '+next);process.exit(0)}const pkg=JSON.parse(fs.readFileSync(root+'package.json','utf8'));pkg.version=next;tauri.version=next;fs.writeFileSync(root+'package.json',JSON.stringify(pkg,null,2)+String.fromCharCode(10));fs.writeFileSync(root+'src-tauri/tauri.conf.json',JSON.stringify(tauri,null,2)+String.fromCharCode(10));const cargo=fs.readFileSync(root+'src-tauri/Cargo.toml','utf8').replace(/(^version\s*=\s*\x22)[^\x22]+(\x22)/m,'$1'+next+'$2');fs.writeFileSync(root+'src-tauri/Cargo.toml',cargo);let lock=fs.readFileSync(root+'src-tauri/Cargo.lock','utf8');lock=lock.replace(/(name\s*=\s*\x22mymdedit\x22\nversion\s*=\s*\x22)[^\x22]+(\x22)/,'$1'+next+'$2');fs.writeFileSync(root+'src-tauri/Cargo.lock',lock);console.log('      Updated package.json / Cargo.toml / Cargo.lock / tauri.conf.json');"
if errorlevel 1 goto :fail

rem ---- Step 2: build ----
echo.
echo [2/3] Building release binary (standalone exe, no installer)...
echo.
set "PNPM=C:\Users\jy\AppData\Roaming\npm\pnpm.cmd"
if exist "%PNPM%" (
    call "%PNPM%" tauri build --no-bundle
) else (
    call npm run tauri build -- --no-bundle
)
if errorlevel 1 goto :fail

rem ---- Step 3: rename exe to include version ----
echo.
echo [3/3] Renaming exe to include version...
echo.
set "MYMDEDIT_ROOT=%ROOT%"
node -e "const fs=require('fs'),p=require('path');const root=process.env.MYMDEDIT_ROOT.replace(/[\\\/]$/,'')+'/';const t=JSON.parse(fs.readFileSync(root+'src-tauri/tauri.conf.json','utf8'));const src=root+'src-tauri/target/release/'+t.mainBinaryName+'.exe';const outDir=root+'output';fs.mkdirSync(outDir,{recursive:true});const to=p.join(outDir,'MyMdEdit-v'+t.version+'.exe');if(!fs.existsSync(src)){console.log('      [WARN] No '+t.mainBinaryName+'.exe found in target/release');}else{if(fs.existsSync(to)){fs.unlinkSync(to);}fs.copyFileSync(src,to);console.log('      Ok: '+t.mainBinaryName+'.exe -> output/'+p.basename(to));}"
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   Build finished successfully!
echo ============================================
echo.
echo Output dir: output\MyMdEdit-vX.Y.Z.exe (standalone, no installer. See Step [3/3] output.)
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Build failed. See messages above.
echo.
pause
exit /b 1
