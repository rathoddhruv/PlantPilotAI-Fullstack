import zipfile
from pathlib import Path
import shutil
import sys
import os

EXPORTS_DIR = Path("label_studio_exports")
YOLO_DATASET_ROOT = Path("data/yolo_dataset")
DEST_IMAGES = YOLO_DATASET_ROOT / "images/train"
DEST_LABELS = YOLO_DATASET_ROOT / "labels/train"
DEST_META = YOLO_DATASET_ROOT
TEMP_UNZIP_DIR = Path("temp/ls_extract")

# Allow passing ZIP path via env or CLI arg
zip_path_env = os.getenv("ZIP_PATH")
zip_path_arg = sys.argv[1] if len(sys.argv) > 1 else None

if zip_path_env:
    zip_files = [Path(zip_path_env)]
elif zip_path_arg:
    zip_files = [Path(zip_path_arg)]
else:
    zip_files = sorted(EXPORTS_DIR.glob("*.zip"), key=lambda z: z.stat().st_mtime, reverse=True)

if not zip_files:
    print("No ZIP export found.")
    sys.exit(1)

latest_zip = zip_files[0]
if not latest_zip.exists():
    print(f"ZIP file not found: {latest_zip}")
    sys.exit(1)

print(f"Using ZIP export: {latest_zip.name}")

# Step 2: Extract zip
if TEMP_UNZIP_DIR.exists():
    shutil.rmtree(TEMP_UNZIP_DIR)
TEMP_UNZIP_DIR.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(latest_zip, 'r') as zip_ref:
    zip_ref.extractall(TEMP_UNZIP_DIR)

# Step 3: Search for images and labels folders
found_images = list(TEMP_UNZIP_DIR.rglob("images"))
found_labels = list(TEMP_UNZIP_DIR.rglob("labels"))

if not found_images or not found_labels:
    print("Missing 'images/' or 'labels/' in the ZIP.")
    sys.exit(1)

src_images = found_images[0]
src_labels = found_labels[0]
print(f"Found image folder: {src_images}")
print(f"Found label folder: {src_labels}")

# Step 4: Move files
DEST_IMAGES.mkdir(parents=True, exist_ok=True)
DEST_LABELS.mkdir(parents=True, exist_ok=True)

for file in src_images.glob("*"):
    if file.is_file():
        shutil.copy2(file, DEST_IMAGES / file.name)

for file in src_labels.glob("*.txt"):
    shutil.copy2(file, DEST_LABELS / file.name)

# Step 5: Optional meta files
for extra in ["classes.txt", "notes.json"]:
    match = list(TEMP_UNZIP_DIR.rglob(extra))
    if match:
        shutil.copy2(match[0], DEST_META / match[0].name)
        print(f"Copied {extra}")

print("YOLO dataset import completed successfully.")
