import sys
import subprocess
import shutil
from pathlib import Path
from ultralytics import YOLO
from BE.settings import ML_DIR, IMPORT_ZIP_SCRIPT, ML_PIPELINE

class MLService:
    def __init__(self):
        self.model = None
        self.model_path = None
        self._load_best_model()

    def _load_best_model(self):
        """Find and load the best available model."""
        # Check standard location first
        possible_paths = [
            ML_DIR / "yolov8s.pt",             # Default base
            ML_DIR / "yolov8n.pt",             # Fallback
        ]
        
        # Check for trained models
        runs_dir = ML_DIR / "runs" / "detect"
        if runs_dir.exists():
            # Find latest run with best.pt
            for run in sorted(runs_dir.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
                best_pt = run / "weights" / "best.pt"
                if best_pt.exists():
                    possible_paths.insert(0, best_pt)
                    break 
        
        for p in possible_paths:
            if p.exists():
                print(f"Loading model from: {p}")
                self.model_path = p
                self.model = YOLO(str(p))
                return

        print("No model found. Inference will fail until a model is trained or downloaded.")

    def run_import_zip(self, zip_path: Path):
        """Run the import script for a Label Studio ZIP."""
        cmd = [sys.executable, str(IMPORT_ZIP_SCRIPT), str(zip_path)]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        if result.returncode != 0:
            raise RuntimeError(f"Import failed: {result.stderr}")
        return result.stdout

    def run_training(self):
        """Run the active learning pipeline in non-interactive mode."""
        cmd = [sys.executable, str(ML_PIPELINE), "--no-interactive"]
        # This might take a while, so we usually run it in background. 
        # For now, we run it synchronously or rely on BackgroundTasks in FastAPI.
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        
        # Reload model after training
        self._load_best_model()
        
        if result.returncode != 0:
            raise RuntimeError(f"Training failed: {result.stderr}")
        return result.stdout

    def predict(self, image_path: Path, conf=0.25):
        """Run inference on a single image."""
        if not self.model:
            self._load_best_model()
            if not self.model:
                raise RuntimeError("No model loaded")

        results = self.model.predict(source=str(image_path), conf=conf)
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
