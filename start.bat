@echo off
setlocal
title Noises Lyrics Studio
cd /d "%~dp0"
echo ====================================================
echo  Noises Lyrics Studio
echo ====================================================

REM 1. Require Node.js 20 or higher (matches package.json "engines")
set "NODE_VER="
for /f "delims=" %%A in ('node -v 2^>nul') do set "NODE_VER=%%A"
if not defined NODE_VER (
  echo ERROR: Node.js 20 or higher is required, but "node" was not found on PATH.
  echo Install Node 20: https://nodejs.org
  exit /b 1
)
set "NODE_MAJOR=%NODE_VER:~1%"
for /f "tokens=1 delims=." %%B in ("%NODE_MAJOR%") do set "NODE_MAJOR=%%B"
if %NODE_MAJOR% LSS 20 (
  echo ERROR: Node.js 20 or higher is required. Found: %NODE_VER%
  echo Install Node 20: https://nodejs.org
  exit /b 1
)

REM 2. Make sure the port is free. This script never terminates other processes.
if not defined PORT set "PORT=3000"
netstat -ano | findstr /C:":%PORT% " | findstr /I "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo ERROR: port %PORT% is already in use by another process.
  echo Free that port, or start on a different one:  set PORT=3001 ^& start.bat
  exit /b 1
)

where yt-dlp >nul 2>&1 || echo NOTE: yt-dlp was not found on PATH. Install it: https://github.com/yt-dlp/yt-dlp#installation

for /f "delims=" %%A in ('powershell -Command "(Get-Content package.json | ConvertFrom-Json).version"') do set "APP_VERSION=%%A"
echo Starting Noises Lyrics Studio (v%APP_VERSION%) on port %PORT%...
echo ====================================================
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Opening browser...
start "" "http://localhost:%PORT%"
echo.
echo Starting the server on http://localhost:%PORT%...
call npm start
pause
