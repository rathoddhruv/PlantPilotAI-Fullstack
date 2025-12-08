#!/bin/bash
# PlantPilotAI Development Launcher (Linux/Mac)

echo "🌿 Starting PlantPilotAI Fullstack..."
echo ""

# Install dependencies
echo "📦 Installing Python dependencies..."
python3 -m pip install "numpy<2" opencv-python pillow ultralytics pyyaml fastapi uvicorn --quiet

# Get the script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start Backend in background
echo "🚀 Starting Backend (Port 8000)..."
cd "$DIR/BE"
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BE_PID=$!

# Wait for backend to start
sleep 3

# Start Frontend in background
echo "🎨 Starting Frontend (Port 4200)..."
cd "$DIR/FE"
npm start &
FE_PID=$!

echo ""
echo "✅ Services are running!"
echo "   Backend: http://localhost:8000"
echo "   Frontend: http://localhost:4200"
echo "   Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for Ctrl+C
trap "kill $BE_PID $FE_PID 2>/dev/null; echo 'Goodbye!'; exit" INT
wait
