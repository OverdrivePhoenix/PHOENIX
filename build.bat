@echo off
setlocal enabledelayedexpansion

echo =====================================================================
echo  PROJECT PHOENIX - SILENT DESKTOP APPLICATION BUILD SYSTEM
echo =====================================================================
echo.

:: 1. Step 1: Compile React Frontend
echo [1/3] Building React + WebGL2 Dashboard (apps/dashboard)...
cd apps\dashboard
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend build failed with error code %ERRORLEVEL%.
    cd ..\..
    exit /b %ERRORLEVEL%
)
cd ..\..
echo [OK] Frontend built successfully to apps/dashboard/dist.
echo.

:: 2. Step 2: Validate Python Virtual Environment
echo [2/3] Checking Python build environment...
if not exist "apps\api\.venv\Scripts\pyinstaller.exe" (
    echo [INFO] PyInstaller not detected in virtualenv. Installing packaging toolchain...
    "C:\Users\Jyothish Krishna.B.S\.local\bin\uv.exe" pip install --python apps\api\.venv\Scripts\python.exe pywebview pyinstaller pystray
)
echo [OK] Python environment verified.
echo.

:: 3. Step 3: Package Standalone Windows .exe with PyInstaller
echo [3/3] Compiling standalone silent executable (dist/PHOENIX.exe)...
apps\api\.venv\Scripts\pyinstaller.exe --clean -y PHOENIX.spec
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PyInstaller compilation failed with error code %ERRORLEVEL%.
    exit /b %ERRORLEVEL%
)

echo.
echo =====================================================================
echo  BUILD COMPLETE!
echo  Executable: dist\PHOENIX.exe
echo.
echo  Properties:
echo   - Mode: Subsystem Windows (Zero Command Prompt / Terminal Popups)
echo   - Internal Services: FastAPI Control Plane + Local Node Daemon
echo   - UI: Native Edge WebView2 with React Bits Strands WebGL2 Orb
echo   - System Tray: Enabled
echo =====================================================================
