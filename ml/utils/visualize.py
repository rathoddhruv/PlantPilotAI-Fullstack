def draw_labels_with_full_conf(image_path, detections, names, output_path):
    import cv2
    image = cv2.imread(str(image_path))
    for cls_id, conf, box in detections:
        label = names[int(cls_id)]
        conf_text = f"{label} ({conf * 100:.6f}%)"
        cx, cy, w, h, angle = box
        x = int(cx - w / 2)
        y = int(cy - h / 2)
        x2 = int(cx + w / 2)
        y2 = int(cy + h / 2)
        cv2.rectangle(image, (x, y), (x2, y2), (0, 255, 0), 2)
        cv2.putText(image, conf_text, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
    cv2.imwrite(str(output_path), image)


