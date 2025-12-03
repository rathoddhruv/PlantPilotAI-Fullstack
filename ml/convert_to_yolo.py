import shutil
from pathlib import Path
from config_loader import ORIGINAL_IMAGES, ORIGINAL_LABELS

# define output dirs
output_img_train = ORIGINAL_IMAGES
output_lbl_train = ORIGINAL_LABELS

# create folders
output_img_train.mkdir(parents=True, exist_ok=True)
output_lbl_train.mkdir(parents=True, exist_ok=True)

# scan all flat image files in the parent image dir
flat_img_dir = output_img_train.parent
flat_lbl_dir = output_lbl_train.parent

all_images = (
    list(flat_img_dir.glob("*.jpg"))
    + list(flat_img_dir.glob("*.jpeg"))
    + list(flat_img_dir.glob("*.png"))
)

valid_count, missing = 0, 0
for img in all_images:
    label_file = flat_lbl_dir / f"{img.stem}.txt"
    if label_file.exists():
        shutil.move(str(img), output_img_train / img.name)
        shutil.move(str(label_file), output_lbl_train / label_file.name)
        valid_count += 1
    else:
        missing += 1

print(f" {valid_count} image-label pairs moved to train/")
print(f"{missing} images had no labels and were skipped")
