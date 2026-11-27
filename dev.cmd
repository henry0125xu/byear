@echo off
rem Double-click to start the ByEar dev server and open it in the browser.
rem Close this window (or press Ctrl+C) to stop the server.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install || goto :error
)
call npm run dev -- --open
goto :eof

:error
echo.
echo npm install failed.
pause
