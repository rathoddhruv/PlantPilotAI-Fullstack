import shutil
from pathlib import Path
import yaml

# Import configuration paths and helpers. In addition to the existing imports,
# we bring in ``WRONG_LABEL_DIR`` so that we can handle false positive
# detections recorded during manual review.
from config_loader import (
    CLASS_MAP_REVERSE,
    ORIGINAL_IMAGES,
    ORIGINAL_LABELS,
    ACTIVE_LABEL_DIR,
    TEST_IMAGE_FOLDER,
    MERGED_DATASET_ROOT,
    YOLO_DATASET_YAML,
    WRONG_LABEL_DIR,
)

merged_root = MERGED_DATASET_ROOT
merged_images = merged_root / "images/train"
merged_labels = merged_root / "labels/train"

# Ensure output directories exist
for path in [merged_images, merged_labels]:
    path.mkdir(parents=True, exist_ok=True)

# === COPY ORIGINAL IMAGES AND LABELS ===
#
# Start from the original YOLO dataset defined in ``ORIGINAL_IMAGES`` and
# ``ORIGINAL_LABELS``. We copy every image and its corresponding label file to
# the merged dataset. This provides a base on which active learning updates are
# layered.
image_files = list(ORIGINAL_IMAGES.glob("*"))
for img_file in image_files:
    shutil.copy(img_file, merged_images / img_file.name)
    label_file = ORIGINAL_LABELS / f"{img_file.stem}.txt"
    if label_file.exists():
        shutil.copy(label_file, merged_labels / label_file.name)

# === COPY ACTIVE LABELS AND MATCHED IMAGES ===
#
# ``ACTIVE_LABEL_DIR`` contains user-approved annotations collected during
# ``manual_review.py``. For each label file in this directory, copy it into
# ``merged_labels`` and also copy the corresponding test image into
# ``merged_images``. Afterwards, remove both the label file and the source image
# from their respective folders to keep things tidy.
active_files = list(ACTIVE_LABEL_DIR.glob("*.txt"))
copied_images = 0
for label_path in active_files:
    shutil.copy(label_path, merged_labels / label_path.name)
    for ext in [".jpg", ".jpeg", ".png"]:
        image_path = TEST_IMAGE_FOLDER / f"{label_path.stem}{ext}"
        if image_path.exists():
            shutil.copy(image_path, merged_images / image_path.name)
            image_path.unlink()
            copied_images += 1
            break
    label_path.unlink()

# === COPY WRONG LABELS AS NEGATIVE IMAGES ===
#
# Files in ``WRONG_LABEL_DIR`` represent detections that the user marked as
# incorrect (false positives). According to Ultralytics guidance, training with
# background images improves a model's ability to reduce false positives by
# teaching it what NOT to detect. To incorporate these examples, we copy the
# corresponding image into ``merged_images`` and create an **empty** annotation
# file in ``merged_labels``. An empty label file signals that the image contains
# no objects, reinforcing it as a negative sample.
wrong_files = list(WRONG_LABEL_DIR.glob("*.txt"))
negative_copied = 0
for wrong_path in wrong_files:
    empty_label_path = merged_labels / wrong_path.name
    empty_label_path.parent.mkdir(parents=True, exist_ok=True)
    empty_label_path.write_text("")
    for ext in [".jpg", ".jpeg", ".png"]:
        image_path = TEST_IMAGE_FOLDER / f"{wrong_path.stem}{ext}"
        if image_path.exists():
            dest_img = merged_images / image_path.name
            if not dest_img.exists():
                shutil.copy(image_path, dest_img)
            try:
                image_path.unlink()
            except Exception:
                pass
            negative_copied += 1
            break
    wrong_path.unlink()

# === DATASET MERGE SUMMARY ===
print(
    f"Copied {len(image_files)} original images and {len(active_files)} active labels"
)
print(
    f"Copied {copied_images} new images from the test folder and removed them afterward"
)
print(f"Copied {negative_copied} negative images from wrong labels")
print("Cleaned up used active and wrong labels as well as test images")

# === GENERATE YOLO DATASET YAML ===
#
# After merging all sources of data, construct a YAML file that describes the
# dataset for Ultralytics YOLO training. The ``train`` and ``val`` entries both
# point to ``images/train`` so that the model uses the full merged dataset for
# both training and validation. ``names`` maps class indices to class names.
dataset_yaml = {
    "path": str(merged_root),
    "train": "images/train",
    "val": "images/train",
    "names": {idx: name for idx, name in CLASS_MAP_REVERSE.items()},
}

merged_images_dir = merged_root / "images/train"
if not any(merged_images_dir.glob("*")):
    print(" No merged training images found. Exiting.")
    exit(1)

with open(YOLO_DATASET_YAML, "w") as f:
    yaml.dump(dataset_yaml, f, sort_keys=False)

print(f"yolo_dataset.yaml updated at {YOLO_DATASET_YAML}")
print("Dataset ready at:", merged_root)

# === FIX CORRUPT LABELS ===
#
# Occasionally annotation files can be malformed (e.g. missing values or
# non-numeric entries). To guard against training crashes, iterate through all
# label files and sanitise them. Any line that does not consist of exactly
# five space-separated numeric values is dropped. If any corrections are made,
# the original file is backed up with a ``.bak`` extension.
LABEL_FOLDER = merged_root / "labels/train"
for label_file in LABEL_FOLDER.glob("*.txt"):
    lines = label_file.read_text().strip().splitlines()
    cleaned = []
    corrupted = False
    for line in lines:
        parts = line.strip().split()
        if len(parts) != 5:
            corrupted = True
            continue
        try:
            floats = [float(x) for x in parts]
            cleaned.append(" ".join(map(str, floats)))
        except ValueError:
            corrupted = True
    if corrupted:
        backup = label_file.with_suffix(".bak")
        if backup.exists():
            backup.unlink()
        label_file.rename(backup)
        label_file.write_text("\n".join(cleaned))
        print(f"Fixed: {label_file.name}, backup saved as {backup.name}")
