@echo off
title Noises Lyrics Studio
cd /d "e:\noises lyric"
echo ====================================================
echo Pulling latest updates from GitHub...
call git pull --rebase --autostash
echo ====================================================
echo Cleaning up zombie Node processes...
taskkill /F /IM node.exe >nul 2>&1
echo ====================================================
for /f "delims=" %%A in ('powershell -Command "(Get-Content package.json | ConvertFrom-Json).version"') do set "APP_VERSION=%%A"
echo Starting Noises Lyrics Studio (v%APP_VERSION%)...
echo ====================================================
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Opening browser...
start http://localhost:3000
echo.
echo Starting the server...
call npm start
pause
