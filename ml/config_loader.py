import os
from pathlib import Path
from dotenv import load_dotenv

# === HELPERS (must be defined before use) ===
def get_path(name, fallback):
    return Path(os.getenv(name, fallback))

def get_float(name, fallback):
    return float(os.getenv(name, fallback))

def get_int(name, fallback):
    return int(os.getenv(name, fallback))

# === LOAD ENV ===
load_dotenv()

# === ORIGINAL PATHS ===
ORIGINAL_IMAGES = get_path("ORIGINAL_IMAGES", "data/yolo_dataset/images/train")
ORIGINAL_LABELS = get_path("ORIGINAL_LABELS", "data/yolo_dataset/labels/train")

# === MODEL PATHS (all same) ===
DEFAULT_DETECT_MODEL = get_path(
    "DEFAULT_DETECT_MODEL", "runs/detect/train/weights/best.pt"
)
DEFAULT_MODEL = get_path("DEFAULT_MODEL", "runs/detect/train/weights/best.pt")
MODEL_PATH = get_path("MODEL_PATH", "runs/detect/train/weights/best.pt")  # universal
# DEFAULT_MODEL = get_path("DEFAULT_MODEL", "runs/detect/train/weights/best.pt")
# MODEL_PATH = get_path("MODEL_PATH", "runs/detect/train/weights/best.pt")  # universal

# === INPUT + REVIEW PATHS ===
TEST_IMAGE_FOLDER = get_path("TEST_IMAGE_FOLDER", "C:/Data/Projects/test-1")
CLASS_FILE = get_path("CLASS_FILE", "class_names.txt")
ORIGINAL_IMAGES = get_path("ORIGINAL_IMAGES", "data/yolo_dataset/images/train")
ORIGINAL_LABELS = get_path("ORIGINAL_LABELS", "data/yolo_dataset/labels/train")

# === REVIEW SETTINGS ===
UNCERTAIN_THRESHOLD = get_float("UNCERTAIN_THRESHOLD", 0.35)
IMG_SIZE = get_int("IMG_SIZE", 960)
ACDSEE_PATH = os.getenv("ACDSEE_PATH", "C:/Program Files/ACD Systems/ACDSee Pro/6.0/ACDSeePro6.exe")

# === OUTPUT PATHS ===
ACTIVE_LABEL_DIR = get_path("ACTIVE_LABEL_DIR", "active_labels")
MANUAL_REVIEW_DIR = get_path("MANUAL_REVIEW_DIR", "active_review")
WRONG_LABEL_DIR = get_path("WRONG_LABEL_DIR", "wrong_labels")
SAVE_DIR = get_path("SAVE_DIR", "runs/active_review_output")
MERGED_DATASET_ROOT = get_path("MERGED_DATASET_ROOT", "data/yolo_merged")
YOLO_DATASET_YAML = get_path("YOLO_DATASET_YAML", "yolo_dataset.yaml")


# === DATA SPLIT ===
SPLIT_RATIO = get_float("SPLIT_RATIO", 0.9)

# === CLASS LABELS ===
with CLASS_FILE.open("r", encoding="utf-8") as f:
    CLASS_NAMES = [line.strip() for line in f if line.strip()]

CLASS_MAP = {name: idx for idx, name in enumerate(CLASS_NAMES)}
CLASS_MAP_REVERSE = {idx: name for name, idx in CLASS_MAP.items()}

# === EXPORT ===
__all__ = [
    "DEFAULT_DETECT_MODEL",
    "DEFAULT_MODEL",
    "MODEL_PATH",
    "TEST_IMAGE_FOLDER",
    "CLASS_FILE",
    "ORIGINAL_IMAGES",
    "ORIGINAL_LABELS",
    "UNCERTAIN_THRESHOLD",
    "IMG_SIZE",
    "ACDSEE_PATH",
    "ACTIVE_LABEL_DIR",
    "MANUAL_REVIEW_DIR",
    "WRONG_LABEL_DIR",
    "SAVE_DIR",
    "MERGED_DATASET_ROOT",
    "YOLO_DATASET_YAML",
    "SPLIT_RATIO",
    "CLASS_NAMES",
    "CLASS_MAP",
    "CLASS_MAP_REVERSE",
]
