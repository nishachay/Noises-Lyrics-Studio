@echo off
title Noises Lyrics Studio
cd /d "e:\noises lyric"
echo ====================================================
echo Starting Noises Lyrics Studio (v6.0.0)...
echo ====================================================
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Starting the server...
call npm start
pause
