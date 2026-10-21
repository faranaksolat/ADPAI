@echo off
cd /d "%~dp0"
py -3.11 --version >nul 2>&1
if errorlevel 1 (
  echo Python 3.11 is required. Install it with:
  echo winget install --id Python.Python.3.11 -e
  echo Then reopen this file.
  pause
  exit /b 1
)
py -3.11 -m pc_server.launch --install --share
pause
