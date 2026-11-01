@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 goto node_missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto node_missing
node -e "if(Math.sign(Number(process.versions.node.split('.')[0])-22)===-1)process.exit(1)"
if errorlevel 1 goto node_missing
set "ADPAI_BIZROUTER_ROOT=%LOCALAPPDATA%\ADPAI-BizRouter"
call npm.cmd install --global --prefix "%ADPAI_BIZROUTER_ROOT%" bizrouter@0.3.12 @openai/codex
if errorlevel 1 goto failed
set "PATH=%ADPAI_BIZROUTER_ROOT%;%PATH%"
echo Login will open BizRouter in your browser. Check that the displayed codes match.
echo Use the account which received the startup credit. Keep keys and tokens private.
call "%ADPAI_BIZROUTER_ROOT%\bizrouter.cmd" login
if errorlevel 1 goto failed
echo Login command completed. This does not move an existing ChatGPT conversation.
echo Next, run START-CODING-WINDOWS.cmd to open a separate BizRouter-billed Codex session.
pause
exit /b 0
:node_missing
echo Install a current Node.js LTS release, version 22 or newer, from https://nodejs.org/en/download
echo Close this window, reopen it, and run CONNECT-WINDOWS.cmd again.
pause
exit /b 1
:failed
echo Setup or login failed. Read the message above. No connection is being claimed.
pause
exit /b 1
