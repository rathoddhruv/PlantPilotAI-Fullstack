import cv2
from pathlib import Path

LABELS_DIR = Path("data/yolo_merged/labels/train")
IMAGES_DIR = Path("data/yolo_merged/images/train")
BACKUP_DIR = Path("data/yolo_merged/labels/backup_non_normalized")

BACKUP_DIR.mkdir(parents=True, exist_ok=True)

def normalize_label_line(line, img_w, img_h):
    parts = line.strip().split()
    if len(parts) != 5:
        return None
    cls, x, y, w, h = map(float, parts)
    return f"{int(cls)} {x/img_w:.6f} {y/img_h:.6f} {w/img_w:.6f} {h/img_h:.6f}\n"

fixed = 0
skipped = 0
for label_file in LABELS_DIR.glob("*.txt"):
    img_file = IMAGES_DIR / (label_file.stem + ".jpg")
    if not img_file.exists():
        print(f"❌ image missing for: {label_file.name}")
        continue

    img = cv2.imread(str(img_file))
    if img is None:
        print(f"❌ cannot open image: {img_file.name}")
        continue

    h, w = img.shape[:2]
    lines = label_file.read_text().strip().splitlines()
    new_lines = []

    for line in lines:
        norm = normalize_label_line(line, w, h)
        if norm:
            new_lines.append(norm)

    if new_lines:
        # backup original
        label_file.rename(BACKUP_DIR / label_file.name)
        # write normalized
        with open(label_file, "w") as f:
            f.writelines(new_lines)
        fixed += 1
    else:
        print(f"⚠️ skipped empty or invalid: {label_file.name}")
        skipped += 1

print(f"\n✅ fixed {fixed} label files")
print(f"⚠️ skipped {skipped} files")
print("📦 backup of originals saved in:", BACKUP_DIR)
