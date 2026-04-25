import logging
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from ultralytics import YOLO

from BE.settings import IMPORT_ZIP_SCRIPT, ML_PIPELINE
from ML.config_loader import (
    RUNS_DIR, IMPORT_DATA_DIR, TRAINING_DATA_DIR, REVIEW_QUEUE_DIR,
    REVIEWED_DATA_DIR, TEMP_DIR, ML_ROOT, MODEL_HISTORY_DIR
)

logger = logging.getLogger("plantpilot")

import json
import threading
from collections import deque


class MLService:
    def __init__(self):
        self.model = None
        self.model_path = None
        self.logs = deque(maxlen=500)
        self.batch_queue = (
            {}
        )  # {filename: {detections, width, height, label_type, timestamp}}
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
            ML_ROOT / "datasets",
            RUNS_DIR,
            IMPORT_DATA_DIR,
            ML_ROOT / "data" / "yolo_dataset_used",
            TRAINING_DATA_DIR,
            REVIEW_QUEUE_DIR,
            ML_ROOT / "label_studio_exports",
            TEMP_DIR,
            ML_ROOT / "eval_output"
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
        REVIEW_QUEUE_DIR.mkdir(parents=True, exist_ok=True)
        IMPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)
        TRAINING_DATA_DIR.mkdir(parents=True, exist_ok=True)
        (ML_ROOT / "datasets").mkdir(exist_ok=True)

        # 4. Final reload
        self.load_model()
        self.log_message("Project reset successful.")

    def load_model(self):
        """Load the newest best.pt or fallback to base model."""
        runs_dir = RUNS_DIR / "detect"

        # Look for the absolute latest best.pt across ALL subfolders
        all_weights = list(runs_dir.rglob("weights/best.pt")) if runs_dir.exists() else []
        if all_weights:
            # Sort by modification time, newest first
            newest_weight = max(all_weights, key=lambda p: p.stat().st_mtime)
            self.log_message(f"🧠 Loading trained brain: {newest_weight.parent.parent.name}")
            self.model = YOLO(str(newest_weight))
            import torch
            if torch.cuda.is_available():
                self.model.to('cuda')
                self.log_message("⚡ GPU Acceleration Activated (CUDA)")
            return

        # Fallback to base models
        base_options = ["yolo11n.pt", "yolov8n.pt", "yolov8s.pt"]
        for opt in base_options:
            path = ML_ROOT / opt
            if path.exists():
                self.log_message(f"ℹ️ Training not run yet. Using base model: {opt}")
                self.model = YOLO(str(path))
                import torch
                if torch.cuda.is_available():
                    self.model.to('cuda')
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
            cwd=str(ML_ROOT)  # CRITICAL: Run from ML directory
        )

        if result.returncode != 0:
            self.log_message(f"Import failed: {result.stderr}")
            raise RuntimeError(f"Import failed: {result.stderr}")

        self.log_message("Import completed.")
        return result.stdout

    def run_training(self, epochs=100, imgsz=960, model="yolov8n.pt"):
        """Run the active learning pipeline with streaming output."""
        self.logs.clear()
        self.log_message("🚀 NEURAL ENGINE IGNITION: Preparing refinement pipeline...")
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
        uploads_file = REVIEW_QUEUE_DIR / filename

        # Target directory for active learning refinement
        active_labels_dir = REVIEWED_DATA_DIR
        active_labels_dir.mkdir(parents=True, exist_ok=True)

        if not uploads_file.exists():
            raise FileNotFoundError(f"Source file {filename} not found in uploads")

        # Image stays in test_images; boost_merge_labels.py will pick it up and move it to yolo_merged.

        # Create Label File (YOLO format: class_id x_center y_center width height)
        # detections items: { class, box: [x1,y1,x2,y2] }
        # Need to map class names to IDs.
        # We assume self.model.names exists.

        label_path = active_labels_dir / f"{Path(filename).stem}.txt"

        if not self.model:
            self.load_model()

        # Create case-insensitive reverse map for names
        name_to_id = {str(v).lower(): k for k, v in self.model.names.items()}
        self.log_message(f"DEBUG: Model Names: {self.model.names}")

        with label_path.open("w") as f:
            for det in detections:
                class_name = str(det['class']).lower()
                if class_name not in name_to_id:
                    self.log_message(f"Unknown class {class_name}, skipping. Avail: {list(name_to_id.keys())}")
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

    def get_staged_stats(self):
        """Count images and classes currently in yolo_merged (staged for next train)."""
        merged_images = TRAINING_DATA_DIR / "images" / "train"
        merged_labels = TRAINING_DATA_DIR / "labels" / "train"

        images = list(merged_images.glob("*")) if merged_images.exists() else []
        labels = list(merged_labels.glob("*.txt")) if merged_labels.exists() else []

        classes = set()
        for lab in labels:
            if lab.stat().st_size > 0:
                try:
                    for line in lab.read_text().splitlines():
                        if line.strip():
                            classes.add(line.split()[0])
                except:
                    pass

        return {
            "images": len(images),
            "classes": len(classes)
        }

    def get_staged_stats(self):
        """Count images and classes currently in yolo_merged (staged for next train)."""
        merged_images = ML_DIR / "data" / "yolo_merged" / "images" / "train"
        merged_labels = ML_DIR / "data" / "yolo_merged" / "labels" / "train"

        images = list(merged_images.glob("*")) if merged_images.exists() else []
        labels = list(merged_labels.glob("*.txt")) if merged_labels.exists() else []

        classes = set()
        for lab in labels:
            if lab.stat().st_size > 0:
                try:
                    for line in lab.read_text().splitlines():
                        if line.strip():
                            classes.add(line.split()[0])
                except:
                    pass

        return {
            "images": len(images),
            "classes": len(classes)
        }

    def flush_staged(self):
        """Wipe the staged images and labels in yolo_merged."""
        merged_images = TRAINING_DATA_DIR / "images" / "train"
        merged_labels = TRAINING_DATA_DIR / "labels" / "train"

        if merged_images.exists():
            shutil.rmtree(merged_images)
            merged_images.mkdir(parents=True, exist_ok=True)

        if merged_labels.exists():
            shutil.rmtree(merged_labels)
            merged_labels.mkdir(parents=True, exist_ok=True)

        self.log_message("🧼 Staged data flushed successfully.")
        return True

    # ========== BATCH PROCESSING QUEUE ==========

    def queue_annotation(
        self,
        filename: str,
        detections: list,
        width: int,
        height: int,
        label_type: str = "correct",
    ):
        """
        Add annotation to batch queue instead of training immediately.
        label_type: "correct", "false_positive", "false_negative", "low_confidence"
        """
        if filename not in self.batch_queue:
            self.batch_queue[filename] = {
                "detections": detections,
                "width": width,
                "height": height,
                "label_type": label_type,
                "timestamp": datetime.now().isoformat(),
            }
            self.log_message(
                f"📦 Queued annotation for {filename} (type: {label_type})"
            )
        else:
            # Update existing
            self.batch_queue[filename]["detections"] = detections
            self.batch_queue[filename]["label_type"] = label_type
            self.log_message(f"🔄 Updated queued annotation for {filename}")

        return {
            "status": "queued",
            "queue_size": len(self.batch_queue),
            "max_batch_size": 20,
        }

    def reject_annotation(self, filename: str):
        """Remove annotation from queue (user rejected it)."""
        if filename in self.batch_queue:
            del self.batch_queue[filename]
            self.log_message(f"❌ Removed {filename} from batch queue")

        # Also remove from test_images if present
        test_image = REVIEW_QUEUE_DIR / filename
        if test_image.exists():
            test_image.unlink()
            self.log_message(f"🗑️ Deleted {filename} from test_images")

        return {"status": "rejected", "queue_size": len(self.batch_queue)}

    def get_batch_status(self):
        """Return current batch queue status."""
        return {
            "queue_size": len(self.batch_queue),
            "max_batch_size": 20,
            "items": [
                {
                    "filename": fn,
                    "label_type": info["label_type"],
                    "timestamp": info["timestamp"],
                    "detection_count": len(info["detections"]),
                }
                for fn, info in list(self.batch_queue.items())
            ],
            "ready_to_train": len(self.batch_queue) > 0,
        }

    def accept_batch(self):
        """Process all queued annotations and save to training dataset, then trigger training."""
        if not self.batch_queue:
            return {"status": "error", "message": "Batch queue is empty"}

        saved_count = 0
        try:
            for filename, info in self.batch_queue.items():
                detections = info["detections"]
                width = info["width"]
                height = info["height"]
                label_type = info["label_type"]

                # Handle different label types
                if label_type == "false_positive":
                    # For false positives, save empty label (no objects)
                    test_image = REVIEW_QUEUE_DIR / filename
                    if test_image.exists():
                        merged_images = (
                            TRAINING_DATA_DIR / "images" / "train"
                        )
                        merged_labels = (
                            TRAINING_DATA_DIR / "labels" / "train"
                        )
                        merged_images.mkdir(parents=True, exist_ok=True)
                        merged_labels.mkdir(parents=True, exist_ok=True)

                        # Copy image
                        shutil.copy2(test_image, merged_images / filename)
                        # Create empty label file (negative sample)
                        label_path = merged_labels / f"{Path(filename).stem}.txt"
                        label_path.write_text("")
                        self.log_message(
                            f"✓ Saved {filename} as negative sample (false positive)"
                        )
                        saved_count += 1
                elif label_type == "false_negative":
                    # For false negatives, save with user-corrected detections (high priority)
                    self.save_annotation(filename, detections, width, height)
                    saved_count += 1
                else:
                    # "correct" or "low_confidence" - save normally
                    self.save_annotation(filename, detections, width, height)
                    saved_count += 1

            self.log_message(
                f"✅ Batch accepted: {saved_count}/{len(self.batch_queue)} annotations saved"
            )
            self.batch_queue.clear()

            return {
                "status": "success",
                "saved": saved_count,
                "message": f"Batch of {saved_count} annotations processed and saved",
            }
        except Exception as e:
            self.log_message(f"❌ Batch processing failed: {e}")
            return {"status": "error", "message": str(e)}


# Singleton instance
ml_service = MLService()
