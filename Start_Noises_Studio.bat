@echo off
title Noises Lyrics Studio
cd /d "e:\noises lyric"
echo ====================================================
echo Pulling latest updates from GitHub...
call git pull
echo ====================================================
echo Starting Noises Lyrics Studio (v7.0.13)...
echo ====================================================
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Starting the server...
call npm start
pause
