import cv2
import shutil
import subprocess
import platform
import time
from pathlib import Path
from ultralytics import YOLO
from tabulate import tabulate

if platform.system() == "Windows":
    try:
        import win32gui
        import win32con
    except ImportError:
        win32gui = None
        win32con = None

from config_loader import *

from glob import glob

detect_weights = sorted(
    glob("runs/detect/**/weights/best.pt", recursive=True),
    key=lambda x: Path(x).stat().st_mtime,
    reverse=True,
)
if not detect_weights:
    print(" no trained model found in runs/detect")
    exit()

model_path = Path(detect_weights[0])
print(f" using latest model: {model_path}")

if not model_path.exists():
    print(f"Model path does not exist: {model_path}")
    exit()

model = YOLO(model_path)

image_paths = (
    list(Path(TEST_IMAGE_FOLDER).glob("*.jpg"))
    + list(Path(TEST_IMAGE_FOLDER).glob("*.jpeg"))
    + list(Path(TEST_IMAGE_FOLDER).glob("*.png"))
)
if not image_paths:
    print("No images found!")
    exit()

print("\nReview mode:")
print("1. All images")
print(f"2. Only confidence < {int(UNCERTAIN_THRESHOLD * 100)}%")
review_all = input("Enter 1 or 2: ").strip() == "1"

SAVE_DIR.mkdir(exist_ok=True, parents=True)
ACTIVE_LABEL_DIR.mkdir(exist_ok=True)
MANUAL_REVIEW_DIR.mkdir(exist_ok=True)
WRONG_LABEL_DIR.mkdir(exist_ok=True)
MERGED_DATASET_ROOT.joinpath("images/train").mkdir(parents=True, exist_ok=True)

def restore_terminal():
    if platform.system() == "Windows" and win32gui and win32con:
        try:
            hwnd = win32gui.GetForegroundWindow()
            win32gui.SetForegroundWindow(hwnd)
        except Exception:
            pass

summary = []
current_index = 0
while current_index < len(image_paths):
    img_path = image_paths[current_index]
    print(f"\nPredicting: {img_path.name}")

    results = model.predict(
        source=str(img_path),
        imgsz=960,
        conf=0.05,
        save=True,
        save_dir=str(SAVE_DIR),
        line_width=3,
    )
    result = results[0]
    names = result.names
    boxes = result.boxes
    row = [img_path.name]
    detected_labels = []
    detections = []

    if boxes and boxes.cls.numel() > 0:
        classes = boxes.cls.tolist()
        scores = boxes.conf.tolist()
        box_data = boxes.xywh.tolist()
        detections = list(zip(classes, scores, box_data))

    img_display = Path(result.save_dir) / img_path.name
    try:
        subprocess.Popen(
            [ACDSEE_PATH, str(img_display)],
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.1)
        restore_terminal()
    except:
        img = cv2.imread(str(img_display))
        if img is not None:
            cv2.imshow("Review", img)
            cv2.waitKey(1)
            restore_terminal()

    if not detections:
        print("No detections. Label manually? (y/n): ", end="")
        if input().lower() == "y":
            shutil.copy(str(img_path), MANUAL_REVIEW_DIR / img_path.name)
            row.append("Manual review")
        else:
            print("deleting image because no objects marked...")
            try:
                Path(img_path).unlink()
                merged_train_img = MERGED_DATASET_ROOT / "images/train" / img_path.name
                if merged_train_img.exists():
                    merged_train_img.unlink()
                for label_dir in [ACTIVE_LABEL_DIR, WRONG_LABEL_DIR]:
                    label_file = label_dir / f"{img_path.stem}.txt"
                    if label_file.exists():
                        label_file.unlink()
            except Exception as e:
                print(f"could not delete: {e}")

    handled = set()
    idx = 0
    while idx < len(detections):
        cls_id, conf, box = detections[idx]
        if idx in handled:
            idx += 1
            continue
        label = names[int(cls_id)]
        conf_pct = f"{conf * 100:.3f}"
        if not review_all and conf >= UNCERTAIN_THRESHOLD:
            idx += 1
            continue

        prompt = f"{label} ({conf_pct}%) - y=yes, w=wrong, y1=rest class yes, w1=rest class no, p=prev, s=skip detection, s1=skip image: "
        ans = input(prompt).strip().lower()
        if ans == "p" and current_index > 0:
            current_index -= 1
            break
        elif ans == "s":
            idx += 1
            continue
        elif ans == "s1":
            row.append("Skipped image")
            summary.append(row)
            current_index += 1
            break
        elif ans in ["y", "yes"]:
            with open(ACTIVE_LABEL_DIR / f"{img_path.stem}.txt", "a") as f:
                f.write(f"{int(cls_id)} {' '.join(map(str, box))}\n")
            shutil.copy(str(img_path), MERGED_DATASET_ROOT / "images/train")
            detected_labels.append(f"{label} ")
        elif ans in ["w", "wrong"]:
            detections.pop(idx)
            idx -= 1
            detected_labels.append(f"{label} ")
        elif ans == "y1":
            for i, (cid, _, b) in enumerate(detections):
                if cid == cls_id and i not in handled:
                    with open(ACTIVE_LABEL_DIR / f"{img_path.stem}.txt", "a") as f:
                        f.write(f"{int(cid)} {' '.join(map(str, b))}\n")
                    handled.add(i)
            shutil.copy(str(img_path), MERGED_DATASET_ROOT / "images/train")
            detected_labels.append(f"{label} class ")
        elif ans == "w1":
            to_remove = []
            for i, (cid, _, _) in enumerate(detections):
                if cid == cls_id and i not in handled:
                    to_remove.append(i)
            for i in sorted(to_remove, reverse=True):
                detections.pop(i)
            detected_labels.append(f"{label} class ")
            handled.update(to_remove)
        else:
            print("Invalid input.")
            continue

        handled.add(idx)
        idx += 1

    if idx >= len(detections):
        label_file_path = ACTIVE_LABEL_DIR / f"{img_path.stem}.txt"
        if detections:
            with open(label_file_path, "w") as f:
                for det in detections:
                    cls_id, _, box = det
                    f.write(f"{int(cls_id)} {' '.join(map(str, box))}\n")
            shutil.copy(str(img_path), MERGED_DATASET_ROOT / "images/train")
        else:
            print("No valid detections left. Keeping image without label.")
            label_file_path.unlink(missing_ok=True)

        row.append(", ".join(detected_labels))
        summary.append(row)
        current_index += 1
        cv2.destroyAllWindows()

print("\nSummary:")
print(tabulate(summary, headers=["Image", "Detections"], tablefmt="grid"))

def draw_labels_with_full_conf(image_path, detections, names, output_path):
    import cv2

    image = cv2.imread(str(image_path))
    for cls_id, conf, box in detections:
        label = names[int(cls_id)]
        conf_text = f"{label} ({conf * 100:.6f}%)"

        cx, cy, w, h = box[:4]
        x = int(cx - w / 2)
        y = int(cy - h / 2)
        x2 = int(cx + w / 2)
        y2 = int(cy + h / 2)

        cv2.rectangle(image, (x, y), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            image,
            conf_text,
            (x, y - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 255, 255),
            1,
            cv2.LINE_AA
        )

    cv2.imwrite(str(output_path), image)
