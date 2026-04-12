@echo off
echo 🌿 Starting PlantPilotAI Fullstack...
echo.

REM Install dependencies
echo 📦 Installing Python dependencies...
python -m pip install "numpy<2" opencv-python pillow ultralytics pyyaml fastapi uvicorn python-multipart --quiet

REM Start Backend in new window
echo 🚀 Starting Backend (Port 8000)...
set PYTHONPATH=%~dp0
start "PlantPilot Backend" cmd /k "set PYTHONPATH=%~dp0 && cd /d %~dp0 && python -m uvicorn BE.main:app --reload --host 0.0.0.0 --port 8000"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start Frontend in new window
echo 🎨 Starting Frontend (Port 4200)...
start "PlantPilot Frontend" cmd /k "cd /d %~dp0FE && npm start"

echo.
echo ✅ Services starting in separate windows!
echo    Backend: http://localhost:8000
echo    Frontend: http://localhost:4200
echo    Docs: http://localhost:8000/docs
echo.
echo Close the terminal windows to stop services.
pause
