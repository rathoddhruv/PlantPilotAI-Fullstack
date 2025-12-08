import subprocess
import sys
import time
import os
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).parent
BE_DIR = ROOT_DIR / "BE"
FE_DIR = ROOT_DIR / "FE"

def run_dev():
    print("🌿 Starting PlantPilotAI Fullstack...")

    # Install dependencies
    print("📦 Installing dependencies (numpy)...")
    subprocess.run([sys.executable, "-m", "pip", "install", "numpy"], check=False)
    
    print("installing cv2 pillow ultralytics pyyaml")
    subprocess.run([sys.executable, "-m", "pip", "install", "numpy<2", "opencv-python", "pillow", "ultralytics", "pyyaml"], check=False)

    # Start Backend
    print("🚀 Starting FastAPI Backend (Port 8000)...")
    # We use Popen to run in parallel
    be_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "BE.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        cwd=ROOT_DIR,
        env={**os.environ, "PYTHONPATH": str(ROOT_DIR)}
        # creationflags=0x00000010 (Removed to debug output in main terminal)
    )

    # Start Frontend
    print("🎨 Starting Angular Frontend (Port 4200)...")
    # Use 'npm start' or 'ng serve'
    # Windows needs shell=True for npm/ng sometimes, or use full path. Keeping it simple.
    fe_cmd = ["npm", "start"]
    if sys.platform == "win32":
        fe_cmd = ["cmd", "/c", "npm", "start"]

    fe_process = subprocess.Popen(
        fe_cmd,
        cwd=FE_DIR,
        shell=False # cmd /c handles the shell part
    )

    print("\n✅ Services are running!")
    print("    Backend: http://localhost:8000")
    print("    Frontend: http://localhost:4200")
    print("    Docs:    http://localhost:8000/docs")
    print("\nPress Ctrl+C to stop all services.")

    try:
        while True:
            time.sleep(1)
            # Check if processes are still alive
            if be_process.poll() is not None:
                print("❌ Backend stopped unexpectedly.")
                break
            if fe_process.poll() is not None:
                print("❌ Frontend stopped unexpectedly.")
                break
    except KeyboardInterrupt:
        print("\n🛑 Stopping services...")
    finally:
        be_process.terminate()
        fe_process.terminate()
        print("Goodbye!")

if __name__ == "__main__":
    run_dev()
