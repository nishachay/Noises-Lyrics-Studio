@echo off
title Noises Lyrics Studio
echo ====================================================
echo Starting Noises Lyrics Studio (v3.3.0)...
echo ====================================================
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Starting the server...
call npm start
pause
