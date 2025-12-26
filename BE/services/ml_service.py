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

        base = ML_DIR / "yolov8n.pt"
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
        
        # Run from ML directory since script uses relative paths
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            encoding="utf-8",
            cwd=str(ML_DIR)  # CRITICAL: Run from ML directory
        )
        
        if result.returncode != 0:
            self.log_message(f"Import failed: {result.stderr}")
            raise RuntimeError(f"Import failed: {result.stderr}")
            
        self.log_message("Import completed.")
        return result.stdout

    def run_training(self, epochs=100, imgsz=960, model="yolov8n.pt"):
        """Run the active learning pipeline with streaming output."""
        cmd = [
            sys.executable, str(ML_PIPELINE), 
            "--no-interactive", 
            f"--epochs={epochs}", 
            f"--imgsz={imgsz}",
            f"--model={model}"
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
        
        if result.obb is not None:
            # OBB Detection
            logger.info("Found OBB results")
            for obb in result.obb:
                detections.append({
                    "class": result.names[int(obb.cls)],
                    "confidence": float(obb.conf),
                    "box": obb.xyxy.tolist()[0], # Axis-aligned BBox for UI
                    "poly": obb.xyxyxyxyn.tolist()[0] # Normalized polygon 0-1
                })
        elif result.masks is not None:
             # Segmentation
            logger.info("Found Segmentation results")
            for i, mask in enumerate(result.masks):
                 # result.boxes contains the bbox for each mask
                 box = result.boxes[i].xyxy.tolist()[0]
                 # result.masks.xyn is list of normalized segments (list of [pk, 2])
                 # We take the first segment
                 poly = mask.xyn[0].flatten().tolist()
                 
                 detections.append({
                    "class": result.names[int(result.boxes[i].cls)],
                    "confidence": float(result.boxes[i].conf),
                    "box": box,
                    "poly": poly
                })
        else:
            # Standard Detection
            for box in result.boxes:
                detections.append({
                    "class": result.names[int(box.cls)],
                    "confidence": float(box.conf),
                    "box": box.xyxy.tolist()[0] # [x1, y1, x2, y2]
                })
            
        return detections

    def save_annotation(self, filename: str, detections: list, width: int, height: int):
        """
        Save a user-verified annotation to the training set.
        Moves image from uploads to dataset and creates .txt label.
        """
        uploads_file = ML_DIR / "data" / "test_images" / filename
        
        # Target directories (merged dataset)
        train_images_dir = ML_DIR / "data" / "yolo_merged" / "images" / "train"
        train_labels_dir = ML_DIR / "data" / "yolo_merged" / "labels" / "train"
        
        train_images_dir.mkdir(parents=True, exist_ok=True)
        train_labels_dir.mkdir(parents=True, exist_ok=True)
        
        if not uploads_file.exists():
            raise FileNotFoundError(f"Source file {filename} not found in uploads")

        # Move image
        target_image_path = train_images_dir / filename
        shutil.copy2(uploads_file, target_image_path) 
        # Note: Copy instead of move so we don't break the frontend 'current' view immediately if they refresh? 
        # Actually move is cleaner for 'inbox' style, but let's copy to be safe.
        
        # Create Label File (YOLO format: class_id x_center y_center width height)
        # detections items: { class, box: [x1,y1,x2,y2] }
        # Need to map class names to IDs.
        # We assume self.model.names exists.
        
        label_path = train_labels_dir / f"{Path(filename).stem}.txt"
        
        if not self.model:
            self.load_model()
            
        # Create reverse map for names
        name_to_id = {v: k for k, v in self.model.names.items()}
        
        with label_path.open("w") as f:
            for det in detections:
                class_name = det['class']
                if class_name not in name_to_id:
                    logger.warning(f"Unknown class {class_name}, skipping")
                    continue
                
                cid = name_to_id[class_name]
                if 'poly' in det and det['poly']:
                    # OBB/Seg Format: class x1 y1 x2 y2 ... (normalized)
                    poly_str = " ".join([f"{p:.6f}" for p in det['poly']])
                    f.write(f"{cid} {poly_str}\n")
                else:
                    # Standard Box Format: class xc yc w h (normalized)
                    x1, y1, x2, y2 = det['box']
                    
                    # Normalize to 0-1
                    dw = 1.0 / width
                    dh = 1.0 / height
                    
                    w = x2 - x1
                    h = y2 - y1
                    cx = x1 + (w / 2)
                    cy = y1 + (h / 2)
                    
                    cx *= dw
                    cy *= dh
                    w *= dw
                    h *= dh
                    
                    f.write(f"{cid} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
                
        self.log_message(f"Saved annotation for {filename} with {len(detections)} labels")
        return True

# Singleton instance
ml_service = MLService()
