# settings.py
from pathlib import Path

# project root = .../PlantPilotAI-Fullstack
ROOT_DIR = Path(__file__).resolve().parents[1]

# paths
ML_DIR = (ROOT_DIR / "ML").resolve()
UPLOAD_DIR = (ML_DIR / "data" / "test_images").resolve()
LABEL_STUDIO_DIR = (ML_DIR / "label_studio_exports").resolve()

# scripts
ML_PIPELINE = ML_DIR / "active_learning_pipeline.py"
IMPORT_ZIP_SCRIPT = ML_DIR / "import_yolo_dataset_from_zip.py"

# optional dataset helpers
YOLO_DATASET_ROOT = (ML_DIR / "data" / "yolo_dataset").resolve()
YOLO_DATASET_IMAGES = YOLO_DATASET_ROOT / "images" / "train"
YOLO_DATASET_LABELS = YOLO_DATASET_ROOT / "labels" / "train"
YOLO_MERGED_ROOT = (ML_DIR / "data" / "yolo_merged").resolve()
YOLO_MERGED_IMAGES = YOLO_MERGED_ROOT / "images" / "train"
YOLO_MERGED_LABELS = YOLO_MERGED_ROOT / "labels" / "train"
