@echo off
setlocal
cd /d "%~dp0"
if exist "data\.cosmetics-venv\Scripts\python.exe" goto install
where py >nul 2>nul
if errorlevel 1 goto usepython
py -3 -m venv data\.cosmetics-venv
if errorlevel 1 goto failed
goto install
:usepython
python -m venv data\.cosmetics-venv
if errorlevel 1 goto failed
:install
"data\.cosmetics-venv\Scripts\python.exe" -m pip install Pillow==12.3.0
if errorlevel 1 goto failed
set "ADPAI_CRAWL_OUTPUT=data\cosmetics-50-%RANDOM%-%RANDOM%"
"data\.cosmetics-venv\Scripts\python.exe" crawl-cosmetics.py --output "%ADPAI_CRAWL_OUTPUT%" --limit 50 --ingredient-hints-only
if errorlevel 3 goto failed
if errorlevel 2 goto incomplete
if errorlevel 1 goto failed
set "ADPAI_CRAWL_EXIT=0"
echo Candidate target reached. Images still require human review.
goto report
:incomplete
set "ADPAI_CRAWL_EXIT=2"
echo Collection is incomplete. Access errors and shortfall are recorded.
:report
echo Results folder: %ADPAI_CRAWL_OUTPUT%
echo Open index.html for photos, and collection-report.json for counts and errors.
pause
exit /b %ADPAI_CRAWL_EXIT%
:failed
echo Could not finish. Python 3.10+ and Internet access are required.
pause
exit /b 1
