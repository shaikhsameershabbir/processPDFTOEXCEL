@echo off
title Voter Extraction Server
color 0A

echo.
echo ====================================================
echo    Voter Extraction - Python Server
echo ====================================================
echo.

cd /d "%~dp0"

if not exist "backend\python-service" (
    echo ERROR: Python service not found!
    pause
    exit /b 1
)

cd backend\python-service

echo [1/2] Checking Python dependencies...
python -m pip install -q -r requirements.txt

echo [2/2] Starting Flask server...
echo.
echo Server URL: http://localhost:5000
echo Frontend:   http://localhost:5000/
echo API:        http://localhost:5000/api/
echo.
echo Press Ctrl+C to stop the server
echo ====================================================
echo.

python app.py

pause

