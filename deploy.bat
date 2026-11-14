@echo off
title Firebase Deploy - microgravitational-flame
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\FirebaseCLI;%PATH%"

echo ========================================================
echo  Deploying Flame in Freefall to Firebase Hosting
echo  Project: microgravitational-flame
echo ========================================================
echo.

echo [1/2] Checking authentication...
call firebase login

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Authentication was not completed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Publishing to Firebase Hosting...
call firebase deploy --only hosting

echo.
echo ========================================================
echo  Done!
echo ========================================================
pause
