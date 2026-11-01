@echo off
setlocal
set "ADPAI_BIZROUTER_ROOT=%LOCALAPPDATA%\ADPAI-BizRouter"
if not exist "%ADPAI_BIZROUTER_ROOT%\bizrouter.cmd" goto connect_first
where git >nul 2>nul
if errorlevel 1 goto git_missing
set "ADPAI_CODE_PROJECT=%~dp0ADPAI"
if not "%~1"=="" set "ADPAI_CODE_PROJECT=%~f1"
if exist "%ADPAI_CODE_PROJECT%\.git" goto project_ready
if exist "%ADPAI_CODE_PROJECT%" goto existing_folder
git clone --branch main --single-branch https://github.com/faranaksolat/ADPAI.git "%ADPAI_CODE_PROJECT%"
if errorlevel 1 goto failed
:project_ready
pushd "%ADPAI_CODE_PROJECT%"
if errorlevel 1 goto failed
if not exist "ADPAI-HANDOFF-2026-11-01.md" copy "%~dp0ADPAI-HANDOFF-2026-11-01.md" "ADPAI-HANDOFF-2026-11-01.md" >nul
set "PATH=%ADPAI_BIZROUTER_ROOT%;%PATH%"
echo Starting a separate coding session billed through BizRouter.
echo In Codex, ask it to read ADPAI-HANDOFF-2026-11-01.md before continuing the project.
echo The BizRouter console-management MCP is disabled for this coding session.
call "%ADPAI_BIZROUTER_ROOT%\bizrouter.cmd" codex --no-mcp --reasoning-effort medium
set "ADPAI_CODE_EXIT=%ERRORLEVEL%"
popd
pause
exit /b %ADPAI_CODE_EXIT%
:connect_first
echo Run CONNECT-WINDOWS.cmd first.
pause
exit /b 1
:git_missing
echo Install Git for Windows from https://git-scm.com/downloads/win and reopen this window.
pause
exit /b 1
:existing_folder
echo The target folder exists without Git metadata. It was left unchanged.
echo Choose a fresh folder or pass the path to an existing ADPAI Git checkout.
pause
exit /b 1
:failed
echo Could not open the project or coding session. Read the message above.
pause
exit /b 1
