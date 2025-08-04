import cv2
from ultralytics import YOLO
from pathlib import Path

model = YOLO("runs/detect/plant_detector_clean/weights/best.pt")
image_folder = Path("data/yolo_merged/images/unlabeled")
label_folder = Path("data/yolo_merged/labels/train")
label_folder.mkdir(parents=True, exist_ok=True)

for img_path in image_folder.glob("*.jpg"):
    results = model.predict(source=str(img_path), imgsz=640, conf=0.25, save=False)
    result = results[0]

    if not result.boxes or result.boxes.conf.max().item() < 0.5:
        img = cv2.imread(str(img_path))
        cv2.imshow("Uncertain Prediction", img)
        print(f"\nLabel this flower for {img_path.name}")
        print("Enter class: 0 for Dandelion, 1 for Hydrangea, or -1 to skip")
        key = input("Your label: ").strip()

        if key in ["0", "1"]:
            h, w, _ = img.shape
            xc, yc, box_w, box_h = 0.5, 0.5, 1.0, 1.0  # assume full image for now
            label_line = f"{key} {xc:.6f} {yc:.6f} {box_w:.6f} {box_h:.6f}"
            label_path = label_folder / f"{img_path.stem}.txt"
            with open(label_path, "w") as f:
                f.write(label_line)
            print(f"✅ Labeled as class {key}")
        else:
            print("⏭️ Skipped")

        cv2.destroyAllWindows()
