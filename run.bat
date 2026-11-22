@echo off
setlocal
echo =====================================================================
echo  PROJECT PHOENIX - AUTONOMOUS AI SOFTWARE ENGINEERING SUITE
echo =====================================================================
echo [INFO] Activating PHOENIX Desktop Command Center...

:: Start the standalone executable in the background
start "" "%~dp0dist\PHOENIX.exe"

echo [OK] PHOENIX is active in the background.
echo [OK] J.A.R.V.I.S. announcement: "System online, Sir."
echo.
timeout /t 2 /nobreak >nul
