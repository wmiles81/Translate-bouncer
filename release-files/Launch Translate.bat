@echo off
REM Translate launcher for Windows.
REM Double-click this file in Explorer to start Translate.
REM On first run, it installs Python dependencies into a local .venv.

cd /d "%~dp0"

where py >nul 2>nul
if %ERRORLEVEL% neq 0 (
  where python >nul 2>nul
  if %ERRORLEVEL% neq 0 (
    echo.
    echo ============================================================
    echo   Translate needs Python 3.11 or newer.
    echo ============================================================
    echo.
    echo Download the official installer from:
    echo    https://www.python.org/downloads/
    echo.
    echo During install, tick "Add Python to PATH".
    echo Then double-click Launch Translate.bat again.
    echo.
    pause
    exit /b 1
  )
  set PY=python
) else (
  set PY=py -3
)

if not exist ".venv" (
  echo.
  echo First-time setup: creating a local Python environment in .venv ...
  %PY% -m venv .venv
  echo Installing dependencies ^(this may take ~30 seconds^)...
  .\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
  .\.venv\Scripts\python.exe -m pip install --quiet -e .
  echo Setup complete.
)

echo.
echo Starting Translate. Your browser will open in a moment.
echo To stop Translate, close this window.
echo.

.\.venv\Scripts\translate.exe
