from config_loader import CLASS_MAP_REVERSE, ORIGINAL_IMAGES
from pathlib import Path
import yaml

# force POSIX-style path for YOLO compatibility
root_path = ORIGINAL_IMAGES.parent.parent.as_posix()

yaml_data = {
    "path": root_path,
    "train": "images/train",
    "val": "images/train",  # same as train if no val split
    "names": {idx: name for idx, name in CLASS_MAP_REVERSE.items()},
}

out_path = Path("yolo_merged.yaml")
with out_path.open("w") as f:
    yaml.dump(yaml_data, f, sort_keys=False)

print(f" dataset yaml generated at: {out_path}")
