@echo off
title Noises Lyrics Studio
cd /d "e:\noises lyric"
echo ====================================================
echo Pulling latest updates from GitHub...
call git pull
echo ====================================================
echo Cleaning up zombie Node processes...
taskkill /F /IM node.exe >nul 2>&1
echo ====================================================
echo Starting Noises Lyrics Studio (v9.0.0)...
echo ====================================================
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Starting the server...
call npm start
pause
