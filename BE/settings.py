from pathlib import Path

# project root = .../PlantPilotAI-Fullstack
ROOT_DIR = Path(__file__).resolve().parents[1]

# key dirs
ML_DIR = ROOT_DIR / "ml"
UPLOAD_DIR = ML_DIR / "data" / "test_images"
LABEL_STUDIO_DIR = ML_DIR / "label_studio_exports"

# scripts
ML_PIPELINE = ML_DIR / "active_learning_pipeline.py"
IMPORT_ZIP_SCRIPT = ML_DIR / "import_yolo_dataset_from_zip.py"
