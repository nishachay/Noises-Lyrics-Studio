@echo off
title Noises Lyrics Studio - Launcher

echo ====================================================
echo             NOISES LYRICS STUDIO
echo ====================================================
echo.

:: 1. Check if Node.js is installed
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed on this computer!
    echo Node.js is required to run the Noises Lyrics Studio engine.
    echo.
    echo Press any key to automatically install Node.js now...
    pause >nul
    echo Installing Node.js (this may take a moment)...
    winget install OpenJS.NodeJS -e --silent
    echo.
    echo [SUCCESS] Node.js has been installed! 
    echo IMPORTANT: Please close this window, then double-click Start-Noises-Studio.bat again.
    pause
    exit
)

:: 2. Check if dependencies are installed
IF NOT EXIST "node_modules\" (
    echo [SETUP] First-time setup detected. Downloading engine components...
    echo This might take a minute or two depending on your internet connection.
    call npm install
    echo.
)

:: 3. Start the application
echo [STARTING] Booting up Noises Lyrics Studio...
echo Please wait while the local server starts. Keep this window open!
echo.
timeout /t 2 /nobreak >nul

:: Open Chrome/Default Browser to the local server
start http://localhost:3000

:: Run the Node.js server
node server.js

:: If the server crashes, keep the window open so we can read the error
echo.
echo [ERROR] The server has stopped unexpectedly.
pause
