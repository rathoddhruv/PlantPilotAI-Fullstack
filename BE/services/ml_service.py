import sys
import subprocess
import shutil
from pathlib import Path
from ultralytics import YOLO
from BE.settings import ML_DIR, IMPORT_ZIP_SCRIPT, ML_PIPELINE

import logging
logger = logging.getLogger("plantpilot")

class MLService:
    def __init__(self):
        self.model = None
        self.model_path = None
        self.load_model()

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
        logger.info(f"Importing Label Studio zip from {zip_path}")
        logger.info(f"Running import command: {cmd}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        
        if result.returncode != 0:
            logger.error(f"Import failed stderr: {result.stderr}")
            raise RuntimeError(f"Import failed: {result.stderr}")
            
        logger.info(f"Import completed with code {result.returncode}")
        return result.stdout

    def run_training(self, epochs=100, imgsz=960):
        """Run the active learning pipeline in non-interactive mode."""
        cmd = [
            sys.executable, str(ML_PIPELINE), 
            "--no-interactive", 
            f"--epochs={epochs}", 
            f"--imgsz={imgsz}"
        ]
        logger.info(f"Starting training with command: {cmd}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        
        if result.returncode != 0:
            logger.error(f"Training failed stderr: {result.stderr}")
            raise RuntimeError(f"Training failed: {result.stderr}")

        logger.info(f"Training completed with code {result.returncode}")
        logger.info("Reloading model after training")
        self.load_model()
        
        return result.stdout

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
