import cv2
from pathlib import Path
import os
import shutil

def normalize_label_line(line, img_w, img_h):
    parts = line.strip().split()
    if len(parts) != 5:
        return None
    try:
        cls, x, y, w, h = map(float, parts)
        # If any value is > 1.0, it's definitely pixel based
        if x > 1.0 or y > 1.0 or w > 1.0 or h > 1.0:
            return f"{int(cls)} {x/img_w:.6f} {y/img_h:.6f} {w/img_w:.6f} {h/img_h:.6f}\n"
        return line.strip() + "\n" # Already normalized
    except:
        return None

def normalize_folder(images_dir, labels_dir):
    images_dir = Path(images_dir)
    labels_dir = Path(labels_dir)
    backup_dir = labels_dir / "backup_pre_norm"
    backup_dir.mkdir(exist_ok=True)

    print(f"Checking coordinates in {labels_dir}...")
    fixed = 0
    for label_file in labels_dir.glob("*.txt"):
        if label_file.name == "classes.txt": continue
        
        img_file = images_dir / (label_file.stem + ".jpg")
        if not img_file.exists(): 
            img_file = images_dir / (label_file.stem + ".png")
        if not img_file.exists(): continue

        img = cv2.imread(str(img_file))
        if img is None: continue
        h, w = img.shape[:2]

        lines = label_file.read_text().splitlines()
        new_lines = []
        needs_fix = False

        for line in lines:
            norm = normalize_label_line(line, w, h)
            if norm:
                if norm != line.strip() + "\n":
                    needs_fix = True
                new_lines.append(norm)

        if needs_fix:
            shutil.copy2(label_file, backup_dir / label_file.name)
            label_file.write_text("".join(new_lines))
            fixed += 1
    
    print(f"Finished normalization. Fixed {fixed} files.")

if __name__ == "__main__":
    # Default behavior for manual run
    normalize_folder("data/yolo_merged/images/train", "data/yolo_merged/labels/train")
