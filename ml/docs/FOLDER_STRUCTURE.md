# FOLDER_STRUCTURE

This document explains the organization of the ML layer inside PlantPilotAI.

## Core Directories

- **`data/`**: The central repository for all images and datasets.
  - **`data/uploads/`** (or `test_images`): Where front-end uploads wait patiently for review.
  - **`data/yolo_dataset/`**: Initial unpacked base dataset imported from Label Studio.
  - **`data/yolo_merged/`**: The active training dataset that YOLO utilizes. This constantly absorbs newly reviewed files.
  - **`data/temp/`**: Transitive directory for zips, models, or processing items.

- **`models/`**: The long-term persistent storage tracker for model states.
  - **`models/base/`**: Holds core foundation models (e.g., `yolov8n.pt`, `yolov8s.pt`).
  - **`models/current/`**: The currently deployed model serving inference and acting as the foundation for the next active learning cycle.
  - **`models/history/`**: Previous refined models archived after each iteration.

- **`runs/`**: Strict log/output directory for Ultralytics YOLO logic natively.
  - **`runs/detect/train/`**: The active training iteration. Archival scripts frequently move completed ones out of here to `models/history/`.

- **`active_labels/`**: Temporary staging folder where user-accepted annotations rest before being merged into `data/yolo_merged/`.

- **`wrong_labels/`**: Temporary staging folder where wildly flawed inferences are recorded as strict negatives before being merged.
