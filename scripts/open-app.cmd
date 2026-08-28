@echo off
setlocal
cd /d "%~dp0\.."
if not exist "package.json" (
  echo Cannot find DeepStudy folder.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo npm not found. Install Node.js and reopen this shortcut.
  pause
  exit /b 1
)
call npm run app
if errorlevel 1 pause