@echo off
title Noises Lyrics Studio
echo ====================================================
echo Starting Noises Lyrics Studio (v4.0.1)...
echo ====================================================
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Starting the server...
call npm start
pause
