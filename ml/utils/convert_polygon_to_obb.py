import os
import numpy as np
from pathlib import Path
import math

def polygon_to_rotated_box(polygon):
    points = np.array(polygon, dtype=np.float32).reshape((4, 2))

    if (
        np.linalg.norm(points[1] - points[0]) < 1e-5
        or np.linalg.norm(points[2] - points[1]) < 1e-5
    ):
        return None

    cx = np.mean(points[:, 0])
    cy = np.mean(points[:, 1])
    edge1 = points[1] - points[0]
    edge2 = points[2] - points[1]
    width = np.linalg.norm(edge1)
    height = np.linalg.norm(edge2)
    angle = math.degrees(math.atan2(edge1[1], edge1[0]))

    if angle < -90:
        angle += 180
    elif angle > 90:
        angle -= 180

    return cx, cy, width, height, angle

def convert_labels(label_folder):
    label_files = list(Path(label_folder).glob("*.txt"))
    print(f"📄 Found {len(label_files)} label files to convert...")

    for file in label_files:
        lines = file.read_text().strip().split("\n")
        new_lines = []

        for line in lines:
            parts = list(map(float, line.strip().split()))
            if len(parts) != 9:
                print(f"⚠️ Skipping invalid label in {file.name}")
                continue

            class_id = int(parts[0])
            polygon = parts[1:]
            result = polygon_to_rotated_box(polygon)

            if result:
                cx, cy, w, h, angle = result
                if abs(angle) > 180:
                    print(f"⚠️ invalid angle {angle:.2f} in {file.name}")
                new_lines.append(f"{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f} {angle:.6f}")
            else:
                print(f"⚠️ Skipped degenerate polygon in {file.name}")

        if new_lines:
            file.write_text("\n".join(new_lines))
            print(f"✅ Converted {file.name}")
        else:
            print(f"❌ All labels in {file.name} were invalid after conversion")

if __name__ == "__main__":
    convert_labels("data/yolo_dataset/labels/train")
