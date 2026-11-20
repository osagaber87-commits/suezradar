@echo off
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20 or later from https://nodejs.org/
  pause
  exit /b 1
)
echo Starting Suez News Radar: http://localhost:3000
start "" "http://localhost:3000"
node server.js
pause
