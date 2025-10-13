from pathlib import Path
import shutil, sys

ARCHIVE = Path("runs/detect/archive")
CURRENT = Path("runs/detect/train")

def usage():
    print("usage: python utils/rollback_model.py <train_YYYYmmdd_HHMMSS>")
    sys.exit(2)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        usage()
    name = sys.argv[1]
    src = ARCHIVE / name
    if not (src / "weights" / "best.pt").exists():
        print(f"not found: {src}/weights/best.pt")
        sys.exit(1)
    # archive current before replacing
    if CURRENT.exists():
        ts = name + "_prev"
        shutil.move(str(CURRENT), str(ARCHIVE / ts))
        print(f"archived current to: {ARCHIVE/ts}")
    shutil.copytree(src, CURRENT)  # copy whole run back to 'train'
    print(f"rolled back to: {src}")
