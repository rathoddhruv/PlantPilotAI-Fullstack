import sys
import subprocess
import shutil
from pathlib import Path
from ultralytics import YOLO
from BE.settings import ML_DIR, IMPORT_ZIP_SCRIPT, ML_PIPELINE

import logging
logger = logging.getLogger("plantpilot")

from collections import deque
import threading

class MLService:
    def __init__(self):
        self.model = None
        self.model_path = None
        self.logs = deque(maxlen=500)
        self.load_model()

    def log_message(self, msg: str):
        logger.info(msg)
        self.logs.append(msg)

    def get_logs(self):
        return list(self.logs)

    def reset_project(self):
        """Reset project data to fresh state."""
        self.log_message("Resetting project data...")
        
        # Paths to clean
        targets = [
            ML_DIR / "datasets",
            ML_DIR / "runs",
            ML_DIR / "uploads" # If we had one here
        ]
        
        for p in targets:
            if p.exists():
                self.log_message(f"Deleting {p}")
                shutil.rmtree(p, ignore_errors=True)
        
        # Re-create empty
        (ML_DIR / "datasets").mkdir(exist_ok=True)
        self.model = None # Reset model in memory
        self.load_model() # Will load base model
        self.log_message("Project reset complete. Ready for fresh upload.")

    def load_model(self):
        runs_dir = ML_DIR / "runs" / "detect"
        logger.info(f"ML load_model called, runs dir: {runs_dir}")
        runs = sorted(
            runs_dir.glob("*/weights/best.pt"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        ) if runs_dir.exists() else []

        if runs:
            logger.info(f"Loading trained best.pt from {runs[0]}")
            self.model = YOLO(str(runs[0]))
            return

        base = ML_DIR / "yolov8s.pt"
        if base.exists():
            logger.info(f"No trained run, loading base model {base}")
            self.model = YOLO(str(base))
            return

        logger.error("No model file found at runs or base. Inference will fail.")
        self.model = None

    def run_import_zip(self, zip_path: Path):
        """Run the import script for a Label Studio ZIP."""
        cmd = [sys.executable, str(IMPORT_ZIP_SCRIPT), str(zip_path)]
        self.log_message(f"Importing Label Studio zip from {zip_path}")
        
        # We can also stream this if we want, but it's usually fast.
        # Let's keep subprocess.run but capture output to logs.
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        
        if result.returncode != 0:
            self.log_message(f"Import failed: {result.stderr}")
            raise RuntimeError(f"Import failed: {result.stderr}")
            
        self.log_message("Import completed.")
        return result.stdout

    def run_training(self, epochs=100, imgsz=960):
        """Run the active learning pipeline with streaming output."""
        cmd = [
            sys.executable, str(ML_PIPELINE), 
            "--no-interactive", 
            f"--epochs={epochs}", 
            f"--imgsz={imgsz}"
        ]
        self.log_message(f"Starting training command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=True, 
            encoding="utf-8",
            bufsize=1
        )
        
        for line in process.stdout:
            line = line.strip()
            if line:
                self.log_message(line)
                
        process.wait()
        
        if process.returncode != 0:
            self.log_message(f"Training failed with code {process.returncode}")
            raise RuntimeError(f"Training failed")

        self.log_message("Training completed successfully.")
        self.log_message("Reloading model...")
        self.load_model()
        return "Success"

    def predict(self, image_path: Path, conf=0.25):
        """Run inference on a single image."""
        logger.info(f"Predict request for {image_path}")
        if not self.model:
            logger.warning("Model is None, will attempt reload")
            self.load_model()
            if not self.model:
                logger.error("No model loaded after reload")
                raise RuntimeError("No model loaded")

        logger.info(f"Using model type {type(self.model)} with conf {conf}")
        results = self.model.predict(source=str(image_path), conf=conf, verbose=False)
        result = results[0]
        
        detections = []
        for box in result.boxes:
            detections.append({
                "class": result.names[int(box.cls)],
                "confidence": float(box.conf),
                "box": box.xyxy.tolist()[0] # [x1, y1, x2, y2]
            })
            
        return detections

# Singleton instance
ml_service = MLService()
