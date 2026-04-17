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

    def reset_project(self, archive: bool = False):
        """Reset project data, optionally archiving instead of wiping."""
        self.log_message(f"Resetting project data (archive={archive})...")
        
        # 1. Force release of model from memory
        self.model = None
        import gc
        gc.collect()
        self.log_message("Model cleared from memory.")

        if archive:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            archive_root = ML_DIR / "archive" / f"project_{ts}"
            archive_root.mkdir(parents=True, exist_ok=True)
            self.log_message(f"Archiving project to {archive_root.name}...")

        # 2. Paths to wipe or archive
        targets = [
            ML_DIR / "datasets",
            ML_DIR / "runs",
            ML_DIR / "data" / "yolo_dataset",
            ML_DIR / "data" / "yolo_dataset_used",
            ML_DIR / "data" / "yolo_merged",
            ML_DIR / "data" / "test_images",
            ML_DIR / "label_studio_exports",
            ML_DIR / "temp",
            ML_DIR / "eval_output"
        ]
        
        for p in targets:
            if p.exists():
                try:
                    if archive:
                        dst = archive_root / p.name
                        shutil.move(str(p), str(dst))
                    else:
                        self.log_message(f"Wiping {p.name}...")
                        shutil.rmtree(p, ignore_errors=True)
                        if p.exists(): shutil.rmtree(p)
                except Exception as e:
                    self.log_message(f"❌ Error on {p.name}: {e}")
        
        # 3. Re-create structures
        (ML_DIR / "data" / "test_images").mkdir(parents=True, exist_ok=True)
        (ML_DIR / "data" / "yolo_dataset").mkdir(parents=True, exist_ok=True)
        (ML_DIR / "data" / "yolo_merged").mkdir(parents=True, exist_ok=True)
        (ML_DIR / "datasets").mkdir(exist_ok=True)
        
        # 4. Final reload
        self.load_model()
        self.log_message("Project reset successful.")

    def load_model(self):
        """Load the newest best.pt or fallback to base model."""
        runs_dir = ML_DIR / "runs" / "detect"
        
        # Look for the absolute latest best.pt across ALL subfolders
        all_weights = list(runs_dir.rglob("weights/best.pt")) if runs_dir.exists() else []
        if all_weights:
            # Sort by modification time, newest first
            newest_weight = max(all_weights, key=lambda p: p.stat().st_mtime)
            self.log_message(f"🧠 Loading trained brain: {newest_weight.parent.parent.name}")
            self.model = YOLO(str(newest_weight))
            return

        # Fallback to base models
        base_options = ["yolo11n.pt", "yolov8n.pt", "yolov8s.pt"]
        for opt in base_options:
            path = ML_DIR / opt
            if path.exists():
                self.log_message(f"ℹ️ Training not run yet. Using base model: {opt}")
                self.model = YOLO(str(path))
                return

        self.log_message("⚠️ CRITICAL: No model found! ZIP upload required.")
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
            # Special check for STATUS_CONTROL_C_EXIT (0xC000013A) which is 3221225794 or -1073741510
            if process.returncode in [3221225794, -1073741510]:
                self.log_message("⚠️ Training was interrupted (Process terminated by system/reload).")
                return "Interrupted"
            
            self.log_message(f"Training failed with code {process.returncode}")
            return f"Error: Code {process.returncode}"
            
        self.log_message("Training completed successfully.")
        self.log_message("Reloading model...")
        self.load_model()
        return "Success"

    def predict(self, image_path: Path, conf=0.25):
        """Run inference on a single image with fusing error protection."""
        if not self.model: self.load_model()
        if not self.model: raise RuntimeError("No model loaded")

        try:
            results = self.model.predict(source=str(image_path), conf=conf, verbose=False)
            return self._extract_detections(results)
        except AttributeError as e:
            if "bn" in str(e):
                self.log_message("⚠️ Fusing error detected. Applying bypass...")
                # Try prediction without automatic fusion
                try:
                    results = self.model.predict(source=str(image_path), conf=conf, verbose=False, fuse=False)
                    return self._extract_detections(results)
                except Exception as inner_e:
                    self.log_message(f"🚨 Bypass failed: {inner_e}")
            raise e
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            raise e

    def _extract_detections(self, results):
        """Helper to safely extract detections from YOLO results."""
        if not results: return []
        result = results[0]
        detections = []
        
        # Check for OBB (Oriented Bounding Boxes)
        if getattr(result, 'obb', None) is not None:
            for i in range(len(result.obb.cls)):
                detections.append({
                    "class": result.names[int(result.obb.cls[i])],
                    "confidence": float(result.obb.conf[i]),
                    "box": result.obb.xyxy[i].tolist(),
                    "poly": result.obb.xyxyxyxyn[i].tolist()
                })
        # Check for Segmentation Masks
        elif getattr(result, 'masks', None) is not None:
            for i in range(len(result.masks.cls)):
                detections.append({
                    "class": result.names[int(result.boxes[i].cls)],
                    "confidence": float(result.boxes[i].conf),
                    "box": result.boxes.xyxy[i].tolist(),
                    "poly": result.masks.xyn[i].tolist()
                })
        # Standard Bounding Boxes
        else:
            for box in result.boxes:
                # Handle box.cls being a tensor
                cls_id = int(box.cls[0]) if hasattr(box.cls, "__len__") else int(box.cls)
                conf_val = float(box.conf[0]) if hasattr(box.conf, "__len__") else float(box.conf)
                detections.append({
                    "class": result.names[cls_id],
                    "confidence": conf_val,
                    "box": box.xyxy[0].tolist() if hasattr(box.xyxy[0], "tolist") else box.xyxy.tolist()
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
