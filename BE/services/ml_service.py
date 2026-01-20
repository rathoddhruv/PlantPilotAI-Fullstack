import sys
import subprocess
import shutil
from pathlib import Path
from ultralytics import YOLO
import yaml
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
            self.model_path = runs[0].name # Just filename or full path? Filename is safer for UI.
            # Actually, user wants to know WHICH run. "train_.../best.pt" or run name "train3"
            # runs[0] is .../runs/detect/train3/weights/best.pt
            # Helpful format: "train3 (best.pt)"
            run_name = runs[0].parent.parent.name
            self.model_path = f"{run_name}/{runs[0].name}"
            return

        base = ML_DIR / "yolov8n.pt"
        if base.exists():
            logger.info(f"No trained run, loading base model {base}")
            self.model = YOLO(str(base))
            self.model_path = "yolov8n.pt (Base)"
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
        detections = []  # <--- FIXED: Initialize list
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

    def get_classes(self):
        """Read classes from yolo_dataset.yaml."""
        try:
            yaml_path = ML_DIR / "data" / "yolo_dataset" / "dataset.yaml" # Wait, actual path is ML_DIR / "yolo_dataset.yaml"
            # In active_learning_pipeline.py: YOLO_DATASET_YAML_ABS = THIS_DIR / "yolo_dataset.yaml"
            yaml_path = ML_DIR / "yolo_dataset.yaml"
            
            if not yaml_path.exists():
                return []
                
            with open(yaml_path, 'r') as f:
                data = yaml.safe_load(f)
                
            if 'names' in data:
                return [data['names'][i] for i in sorted(data['names'].keys())]
            return []
        except Exception as e:
            logger.error(f"Failed to read classes: {e}")
            return []

    def save_annotation(self, filename: str, detections: list, width: int, height: int):
        """
        Save a user-verified annotation to the training set.
        Moves image from uploads to dataset and creates .txt label.
        Automatically adds new classes to yolo_dataset.yaml.
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
        
        # Update YAML if new classes found
        yaml_path = ML_DIR / "yolo_dataset.yaml"
        current_names = {}
        
        if yaml_path.exists():
            with open(yaml_path, 'r') as f:
                yaml_data = yaml.safe_load(f)
                current_names = yaml_data.get('names', {})
        
        # Invert names for lookup
        name_to_id = {v: k for k, v in current_names.items()}
        next_id = max(current_names.keys()) + 1 if current_names else 0
        
        updated_yaml = False
        for det in detections:
            class_name = det['class']
            if class_name not in name_to_id:
                logger.info(f"New class detected: {class_name}. Adding to dataset.")
                name_to_id[class_name] = next_id
                current_names[next_id] = class_name
                next_id += 1
                updated_yaml = True
        
        if updated_yaml:
            with open(yaml_path, 'w') as f:
                yaml_data['names'] = current_names
                yaml.dump(yaml_data, f, sort_keys=False)
            
            # Also update the merged YAML if it exists to keep them in sync? 
            # active_learning_pipeline handles merging, but keeping yolo_dataset.yaml as source of truth is key.
            # We should probably reload the model if classes changed, but simple save is enough for next training cycle.
            self.log_message(f"Updated dataset YAML with new classes: {list(current_names.values())}")

        # Now write labels
        label_path = train_labels_dir / f"{Path(filename).stem}.txt"
        
        with label_path.open("w") as f:
            for det in detections:
                class_name = det['class']
                if class_name not in name_to_id:
                     # Should not happen logic above covers it
                    continue
                
                cid = name_to_id[class_name]
                if 'poly' in det and det['poly']:
                    # OBB/Seg Format
                    poly_str = " ".join([f"{p:.6f}" for p in det['poly']])
                    f.write(f"{cid} {poly_str}\n")
                else:
                    # Standard Box Format
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
