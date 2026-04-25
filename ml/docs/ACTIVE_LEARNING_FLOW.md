# ACTIVE_LEARNING_FLOW

This document outlines the end-to-end active learning workflow utilized by PlantPilotAI.

## Workflow Execution

1. **Upload Image**: 
   - Operations personnel drag and drop images through the FE dashboard.
   - Images are silently cached in the `data/uploads/` queue.

2. **Run Prediction**:
   - The UI polls `getPendingImages` and loads raw images immediately into the Review screen.
   - The backend runs YOLO inference dynamically upon render, overlaying model beliefs on the UI canvas.

3. **Review Detections**:
   - The human operator reviews visually to identify model edge-failures or inaccuracies.
   - Detections can be manually suppressed (ignored).
   
4. **Add Manual Boxes (if needed)**:
   - If the model flatly misses an object, human operators execute **CTRL + DRAG** explicitly over the canvas natively to enforce a missing prediction.
   
5. **Save Labels**:
   - Accepting the image fires a payload to the backend converting GUI coordinates accurately into strict YOLO bounds natively within `active_labels/` (and `wrong_labels/`).

6. **Merge into Training Data**:
   - `boost_merge_labels.py` safely ingests those annotations exactly into `data/yolo_merged/`.

7. **Train Model**:
   - `active_learning_pipeline.py` launches a refined Ultralytics run against `data/yolo_merged/`.

8. **Archive Old Model**:
   - Previous stable models are archived gracefully into `models/history/`.

9. **Save new `best.pt`** as current model:
   - The newly converged weight is deployed globally to `models/current/`.

10. **Use New Model for Next Prediction**:
    - The backend natively hot-reloads the new parameter structure organically for the next incoming inference iteration loop.
