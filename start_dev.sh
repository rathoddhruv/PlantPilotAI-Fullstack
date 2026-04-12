#!/bin/bash
# PlantPilotAI Development Launcher (Git Bash / Linux / Mac)

echo "🌿 Starting PlantPilotAI Fullstack..."
echo ""

# Detect Python command
# We explicitly check for the known working Python 3.11 path first to avoid Windows Store shims
KNOWN_PYTHON="/c/Users/admin/AppData/Local/Programs/Python/Python311/python.exe"
KNOWN_SCRIPTS="/c/Users/admin/AppData/Local/Programs/Python/Python311/Scripts"

if [ -f "$KNOWN_PYTHON" ]; then
    PYTHON_CMD="$KNOWN_PYTHON"
    # Add to PATH so pip installed scripts (uvicorn) are found
    export PATH="$KNOWN_PYTHON:$KNOWN_SCRIPTS:$PATH"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD=python3
elif command -v python &>/dev/null; then
    PYTHON_CMD=python
else
    echo "❌ Python not found! Please install Python 3.11+."
    exit 1
fi

echo "Using Python: $PYTHON_CMD"

# Install dependencies
echo "📦 Installing Python dependencies..."
$PYTHON_CMD -m pip install "numpy<2" opencv-python pillow ultralytics pyyaml fastapi uvicorn python-multipart --quiet

# Get the script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start Backend in background
echo "🚀 Starting Backend (Port 8000)..."
cd "$DIR"
# Use winpty if available for better output on Windows, but run in background
$PYTHON_CMD -m uvicorn BE.main:app --reload --host 0.0.0.0 --port 8000 &
BE_PID=$!

# Wait a moment
sleep 5

# Start Frontend in background
echo "🎨 Starting Frontend (Port 4200)..."
cd "$DIR/FE"
# CI=true suppresses interactive prompts (like analytics/completion) which can hang background processes
CI=true npm start &
FE_PID=$!

echo ""
echo "✅ Services are running in background!"
echo "   Backend: http://localhost:8000"
echo "   Frontend: http://localhost:4200"
echo "   Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for Ctrl+C
trap "kill $BE_PID $FE_PID 2>/dev/null; echo 'Goodbye!'; exit" INT
wait
