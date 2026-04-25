# settings.py
from pathlib import Path
from ML.config_loader import (
    ML_ROOT,
    REVIEW_QUEUE_DIR,
    IMPORT_DATA_DIR,
    TRAINING_DATA_DIR
)

# project root = .../PlantPilotAI-Fullstack
ROOT_DIR = Path(__file__).resolve().parents[1]

# paths
ML_DIR = ML_ROOT
UPLOAD_DIR = REVIEW_QUEUE_DIR
LABEL_STUDIO_DIR = (ML_DIR / "label_studio_exports").resolve()

# scripts
ML_PIPELINE = ML_DIR / "active_learning_pipeline.py"
IMPORT_ZIP_SCRIPT = ML_DIR / "import_yolo_dataset_from_zip.py"

# optional dataset helpers
YOLO_DATASET_ROOT = IMPORT_DATA_DIR
YOLO_DATASET_IMAGES = YOLO_DATASET_ROOT / "images" / "train"
YOLO_DATASET_LABELS = YOLO_DATASET_ROOT / "labels" / "train"
YOLO_MERGED_ROOT = TRAINING_DATA_DIR
YOLO_MERGED_IMAGES = YOLO_MERGED_ROOT / "images" / "train"
YOLO_MERGED_LABELS = YOLO_MERGED_ROOT / "labels" / "train"
