import subprocess
import sys
import os
from pathlib import Path

ROOT_DIR = Path(__file__).parent
BE_DIR = ROOT_DIR / "BE"
FE_DIR = ROOT_DIR / "FE"

def run_dev():
    print("Starting PlantPilotAI Fullstack...")

    # Install dependencies
    print("Installing dependencies...")
    subprocess.run([sys.executable, "-m", "pip", "install", "numpy", "opencv-python", "pillow", "ultralytics", "pyyaml"], check=False)
    
    # Start Backend
    print("Starting FastAPI Backend (Port 8000)...")
    be_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "BE.main:app", "--reload", "--reload-dir", "BE", "--host", "0.0.0.0", "--port", "8000"],
        cwd=ROOT_DIR
    )

    # Start Frontend
    print("Starting Angular Frontend (Port 4200)...")
    # Determine if we use npm or ng
    shell = True if os.name == 'nt' else False
    fe_process = subprocess.Popen(
        ["npm", "start"],
        cwd=FE_DIR,
        shell=shell
    )

    print("Services are running!")
    print("Backend: http://localhost:8000")
    print("Frontend: http://localhost:4200")
    print("Press Ctrl+C to stop.")

    try:
        be_process.wait()
        fe_process.wait()
    except KeyboardInterrupt:
        print("\nStopping services...")
        be_process.terminate()
        fe_process.terminate()
        print("Goodbye!")

if __name__ == "__main__":
    run_dev()
