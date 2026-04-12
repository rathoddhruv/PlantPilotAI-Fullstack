import sys
import os
from pathlib import Path

# Add mother directory to paths so we can import the logic
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fix_non_normalized_labels_logic import normalize_folder

if __name__ == "__main__":
    # Standard Merged Paths
    IMAGES = Path("data/yolo_merged/images/train")
    LABELS = Path("data/yolo_merged/labels/train")
    
    if not IMAGES.exists() or not LABELS.exists():
        print(f"Error: Could not find {IMAGES} or {LABELS}")
        sys.exit(1)
        
    normalize_folder(IMAGES, LABELS)
