@echo off
echo.
echo   Starting LensAI...
echo.
start "" "http://localhost:8080"
python "%~dp0server.py"
pause
