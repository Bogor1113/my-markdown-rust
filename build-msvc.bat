@echo off
setlocal EnableDelayedExpansion
title MyMdEdit Build (MSVC env, no vcvars)

rem ============================================================
rem  Wrapper that prepares the MSVC / Windows SDK environment and
rem  then calls build.bat. Arguments are forwarded.
rem
rem  Usage: build-msvc.bat [no^|minor^|major]
rem
rem  WHY THIS EXISTS - four real failures seen on this machine:
rem
rem   1) Launching build.bat from Git Bash puts MSYS /usr/bin on
rem      PATH, so rustc resolves "link.exe" to Git coreutils link
rem      instead of the MSVC linker:
rem        error: linker `link.exe` not found
rem        note: VS Code is a different product, and is not sufficient
rem      or  link: extra operand ...rcgu.o
rem      Fix: prepend the real MSVC bin dir to PATH.
rem
rem   2) vcvars64.bat cannot be used here: it shells out to
rem      reg.exe, which the agent sandbox blocks.
rem      Fix: build the same variables by hand, no reg.exe.
rem
rem   3) The MSVC linker needs the Windows SDK for the system
rem      libraries (kernel32.lib and friends), which live outside
rem      of the MSVC directory. Without the SDK the link step
rem      cannot resolve them.
rem      Fix: put the SDK Lib and Include dirs into LIB/INCLUDE.
rem
rem   4) This file MUST stay pure ASCII. cmd.exe decodes .bat with
rem      the OEM codepage, so non-ASCII bytes in comments corrupt
rem      the parse and produce errors like
rem        'Usage:' is not recognized as an internal or external command
rem
rem  SYNTAX NOTE: every path below contains "(x86)". Expanding
rem  such a value with %VAR% inside an if-block injects an
rem  unbalanced ")" and cmd aborts the script, so delayed
rem  expansion (!VAR!) is used inside blocks.
rem ============================================================

set "VCROOT=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
set "SDKROOT=C:\Program Files (x86)\Windows Kits\10"

if not exist "%VCROOT%" (
    echo [ERROR] MSVC toolset not found: !VCROOT!
    echo         Install VS Build Tools with the VC.Tools.x86.x64 workload.
    exit /b 1
)
if not exist "%SDKROOT%" (
    echo [ERROR] Windows SDK not found: !SDKROOT!
    echo         Install Windows Software Development Kit 10.0.26100.
    exit /b 1
)

rem ---- latest MSVC toolset version (dir /b, no reg.exe) ----
set "MSVCVER="
for /f "delims=" %%i in ('dir /b /o-n /ad "%VCROOT%" 2^>nul') do if not defined MSVCVER set "MSVCVER=%%i"

rem ---- latest Windows SDK version present in Lib and Include ----
set "SDKVER="
for /f "delims=" %%i in ('dir /b /o-n /ad "%SDKROOT%\Lib" 2^>nul') do if not defined SDKVER set "SDKVER=%%i"
set "SDKINCV="
for /f "delims=" %%i in ('dir /b /o-n /ad "%SDKROOT%\Include" 2^>nul') do if not defined SDKINCV set "SDKINCV=%%i"

if not defined MSVCVER (
    echo [ERROR] Could not detect MSVC toolset version under !VCROOT!
    exit /b 1
)
if not defined SDKVER (
    echo [ERROR] Could not detect Windows SDK version under !SDKROOT!\Lib
    exit /b 1
)

set "MSVC=%VCROOT%\%MSVCVER%"
set "SDK=%SDKROOT%\%SDKVER%"

set "PATH=%MSVC%\bin\Hostx64\x64;%PATH%"
set "LIB=%MSVC%\lib\x64;%SDKROOT%\Lib\%SDKVER%\ucrt\x64;%SDKROOT%\Lib\%SDKVER%\um\x64"
set "INCLUDE=%MSVC%\include;%SDKROOT%\Include\%SDKINCV%\ucrt;%SDKROOT%\Include\%SDKINCV%\um;%SDKROOT%\Include\%SDKINCV%\shared;%SDKROOT%\Include\%SDKINCV%\winrt"

echo MSVC  : %MSVC%
echo SDK   : %SDKVER% (includes %SDKINCV%)
echo.

rem ---- fail fast if no linker is reachable at all ----
where link.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] link.exe not on PATH after MSVC setup.
    exit /b 1
)

cd /d "%~dp0"
call build.bat %*
exit /b %errorlevel%
