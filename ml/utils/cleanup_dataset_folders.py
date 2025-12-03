from pathlib import Path
import shutil

# folders to clean
folders_to_clean = [
    Path("data/yolo_merged/images/train"),
    Path("data/yolo_merged/labels/train"),
    Path("data/yolo_merged/images/train"),
    Path("data/yolo_merged/images/val"),  # we don't use val, but still safe to clean
]

for folder in folders_to_clean:
    if folder.exists():
        for file in folder.glob("*"):
            file.unlink()
        print(f"✔️ cleaned: {folder}")
    else:
        print(f"folder not found: {folder}")
