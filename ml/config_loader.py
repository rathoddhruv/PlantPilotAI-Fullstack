"""
File: config_loader.py

Purpose:
Centralized configuration manager for PlantPilotAI ML Pipeline.
Defines unified directory structures, resolves paths dynamically,
and loads application settings. Keeps paths strictly structured 
into models, data, and runs.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# === DIRECTORY STRUCTURE ===
ML_ROOT = Path(__file__).resolve().parent

# Data Directories
DATA_DIR = ML_ROOT / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
REVIEW_QUEUE_DIR = DATA_DIR / "test_images"  # Historical test_images acts as review_queue
REVIEWED_DATA_DIR = ML_ROOT / "active_labels"      # Where accepted labels are stored
TRAINING_DATA_DIR = DATA_DIR / "yolo_merged" # Merged dataset for next training 
TEMP_DIR = DATA_DIR / "temp"
IMPORT_DATA_DIR = DATA_DIR / "yolo_dataset"
SKIPPED_DIR = ML_ROOT / "skipped_images"

# Model Directories
MODELS_DIR = ML_ROOT / "models"
CURRENT_MODEL_DIR = MODELS_DIR / "current"
MODEL_HISTORY_DIR = MODELS_DIR / "history"
BASE_MODEL_DIR = MODELS_DIR / "base"
RUNS_DIR = ML_ROOT / "runs"

# === HELPER FUNCTIONS ===
def get_path(name: str, fallback: Path | str) -> Path:
    """
    Returns an absolute Path based on an environment variable or fallback.
    """
    val = os.getenv(name)
    if val:
        return Path(val).resolve()
    if isinstance(fallback, str):
        return (ML_ROOT / fallback).resolve()
    return fallback.resolve()

def get_float(name: str, fallback: float) -> float:
    """Gets a float setting from environment variables."""
    return float(os.getenv(name, fallback))

def get_int(name: str, fallback: int) -> int:
    """Gets an integer setting from environment variables."""
    return int(os.getenv(name, fallback))

# Load .env
load_dotenv(dotenv_path=ML_ROOT / ".env")

# === ASSIGNED PATHS ===
TEST_IMAGE_FOLDER = get_path("TEST_IMAGE_FOLDER", REVIEW_QUEUE_DIR)
ACTIVE_LABEL_DIR = get_path("ACTIVE_LABEL_DIR", REVIEWED_DATA_DIR)
WRONG_LABEL_DIR = get_path("WRONG_LABEL_DIR", ML_ROOT / "wrong_labels")
MERGED_DATASET_ROOT = get_path("MERGED_DATASET_ROOT", TRAINING_DATA_DIR)
YOLO_DATASET_YAML = get_path("YOLO_DATASET_YAML", "yolo_dataset.yaml")

# Primary tracking weight across pipeline iterations
MODEL_PATH = get_path("MODEL_PATH", RUNS_DIR / "detect" / "train" / "weights" / "best.pt")

# Original fallback dataset imports
ORIGINAL_IMAGES = IMPORT_DATA_DIR / "images" / "train"
ORIGINAL_LABELS = IMPORT_DATA_DIR / "labels" / "train"

# Review Settings
UNCERTAIN_THRESHOLD = get_float("UNCERTAIN_THRESHOLD", 0.35)
IMG_SIZE = get_int("IMG_SIZE", 960)

# Classes
CLASS_FILE = get_path("CLASS_FILE", "class_names.txt")
if not CLASS_FILE.exists():
    alt_path = ML_ROOT / "class_names.txt"
    if alt_path.exists():
        CLASS_FILE = alt_path
    else:
        CLASS_FILE.write_text("default_class\n", encoding="utf-8")

with CLASS_FILE.open("r", encoding="utf-8") as f:
    CLASS_NAMES = [line.strip() for line in f if line.strip()]

CLASS_MAP = {name: idx for idx, name in enumerate(CLASS_NAMES)}
CLASS_MAP_REVERSE = {idx: name for name, idx in CLASS_MAP.items()}

__all__ = [
    "ML_ROOT", "DATA_DIR", "UPLOADS_DIR", "REVIEW_QUEUE_DIR", "REVIEWED_DATA_DIR", 
    "TRAINING_DATA_DIR", "TEMP_DIR", "IMPORT_DATA_DIR", "MODELS_DIR", "CURRENT_MODEL_DIR",
    "MODEL_HISTORY_DIR", "BASE_MODEL_DIR", "RUNS_DIR", "TEST_IMAGE_FOLDER",
    "ACTIVE_LABEL_DIR", "WRONG_LABEL_DIR", "MERGED_DATASET_ROOT", "YOLO_DATASET_YAML", "MODEL_PATH",
    "ORIGINAL_IMAGES", "ORIGINAL_LABELS", "UNCERTAIN_THRESHOLD", "IMG_SIZE",
    "CLASS_FILE", "CLASS_NAMES", "CLASS_MAP", "CLASS_MAP_REVERSE", "SKIPPED_DIR"
]
