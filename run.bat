@echo off
title MP3 Studio
setlocal EnableDelayedExpansion

echo.
echo  ============================================================
echo    MP3 Studio - Starting up...
echo  ============================================================
echo.


:: ------------------------------------------------------------
::  STEP 1 - Find or Auto-Install Python
:: ------------------------------------------------------------

set PYTHON_CMD=

python --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=python
    goto :python_ok
)

py --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py
    goto :python_ok
)

python3 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=python3
    goto :python_ok
)

:: Check common install locations
for %%V in (313 312 311 310 39) do (
    if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe" (
        set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe"
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python%%V;%LOCALAPPDATA%\Programs\Python\Python%%V\Scripts;%PATH%"
        goto :python_ok
    )
)

:: Python not found - auto install
echo  [..] Python not found. Installing automatically...
echo       Please wait, this takes 2-3 minutes.
echo.

:: Try winget first
winget --version >nul 2>&1
if not errorlevel 1 (
    echo  [..] Installing Python via winget...
    winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    call :refresh_path
    python --version >nul 2>&1
    if not errorlevel 1 (
        set PYTHON_CMD=python
        goto :python_installed
    )
    py --version >nul 2>&1
    if not errorlevel 1 (
        set PYTHON_CMD=py
        goto :python_installed
    )
    goto :search_paths
)

:: Fallback - download Python installer
:download_python
echo  [..] Downloading Python installer (~25 MB)...
powershell -NoProfile -Command "$p='%TEMP%\py_setup.exe'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe' -OutFile $p -UseBasicParsing" >nul 2>&1

if not exist "%TEMP%\py_setup.exe" (
    echo.
    echo  [ERROR] Could not download Python. Check your internet and try again.
    echo.
    echo  Or install manually:
    echo    1. Go to https://www.python.org/downloads/
    echo    2. Download and run the installer
    echo    3. Tick "Add python.exe to PATH"
    echo    4. Run this file again
    pause
    exit /b 1
)

echo  [..] Installing Python silently...
"%TEMP%\py_setup.exe" /quiet PrependPath=1 InstallAllUsers=0 Include_test=0 >nul 2>&1
del "%TEMP%\py_setup.exe" >nul 2>&1
call :refresh_path

    python --version >nul 2>&1
    if not errorlevel 1 (
        set PYTHON_CMD=python
        goto :python_installed
    )
    py --version >nul 2>&1
    if not errorlevel 1 (
        set PYTHON_CMD=py
        goto :python_installed
    )

:search_paths
for %%V in (313 312 311 310 39) do (
    if exist "%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe" (
        set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python%%V\python.exe"
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python%%V;%LOCALAPPDATA%\Programs\Python\Python%%V\Scripts;%PATH%"
        goto :python_installed
    )
)

echo.
echo  [!] Python was installed but needs a PATH refresh.
echo      Please CLOSE this window and double-click run.bat again.
echo.
pause
exit /b 0

:python_installed
echo  [OK] Python installed successfully!
goto :python_ready

:python_ok
echo  [OK] Python is ready

:python_ready


:: ------------------------------------------------------------
::  STEP 2 - Find or Auto-Install FFmpeg
:: ------------------------------------------------------------

ffmpeg -version >nul 2>&1
if not errorlevel 1 (
    echo  [OK] FFmpeg is ready
    goto :ffmpeg_ok
)

echo  [..] FFmpeg not found. Installing automatically...

winget --version >nul 2>&1
if not errorlevel 1 (
    winget install Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    call :refresh_path

    ffmpeg -version >nul 2>&1
    if not errorlevel 1 (
        echo  [OK] FFmpeg installed successfully!
        goto :ffmpeg_ok
    )

    :: Search WinGet packages folder
    for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*") do (
        for /d %%S in ("%%D\ffmpeg-*\bin") do (
            if exist "%%S\ffmpeg.exe" (
                set "PATH=%%S;%PATH%"
                echo  [OK] FFmpeg installed and located.
                goto :ffmpeg_ok
            )
        )
    )

    echo  [!] FFmpeg installed. Close and re-run this file once to finish.
    pause
    exit /b 0
)

echo  [WARNING] Could not install FFmpeg automatically.
echo            Export will not work until FFmpeg is installed.
echo            Run this command in a terminal: winget install Gyan.FFmpeg
echo.
timeout /t 4 >nul

:ffmpeg_ok


:: ------------------------------------------------------------
::  STEP 3 - Install Python packages
:: ------------------------------------------------------------

echo  [..] Checking Python packages...
"%PYTHON_CMD%" -m pip install -r requirements.txt -q --upgrade
if errorlevel 1 (
    echo  [ERROR] Failed to install packages. Check internet and try again.
    pause
    exit /b 1
)
echo  [OK] All packages ready


:: ------------------------------------------------------------
::  STEP 4 - Launch
:: ------------------------------------------------------------

echo.
echo  ============================================================
echo   All done! Opening MP3 Studio in your browser...
echo   Keep this window open while using the app.
echo   Press Ctrl+C to stop the app.
echo  ============================================================
echo.

"%PYTHON_CMD%" app.py
pause
exit /b 0


:: ------------------------------------------------------------
::  Helper: reload PATH from Windows registry
:: ------------------------------------------------------------
:refresh_path
    set "_SP="
    set "_UP="
    for /f "skip=2 tokens=2,*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "_SP=%%b"
    for /f "skip=2 tokens=2,*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "_UP=%%b"
    if defined _SP if defined _UP set "PATH=!_SP!;!_UP!"
    if defined _SP if not defined _UP set "PATH=!_SP!"
exit /b 0
