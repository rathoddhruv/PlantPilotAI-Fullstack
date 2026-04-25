# ML_PIPELINE

This document details the internal scripts driving the ML orchestration layer.

## Execution Scripts

- **`config_loader.py`**:
  The central configuration core. Maps environment paths exactly to structured folders (`models/`, `data/`, `runs/`) ensuring zero path fragmentation across the monolithic application.

- **`active_learning_pipeline.py`**:
  The primary entrypoint wrapping the entire neural retraining event string. It seamlessly manages initial dataset validation, invokes manual review hooks, fires off label merging scripts, dynamically invokes YOLO refinement models natively without CLI overhead, updates and backups the model paths continuously, and commits status logs dynamically to `manifest.json`.

- **`boost_merge_labels.py`**:
  A secure pipeline data synchronization module. Responsible for safely absorbing isolated active reviews (`active_labels/`, `wrong_labels/`) directly into the root training dataset cleanly without overwriting valid data sources. Automatically removes staged files upon successful copy integrations to prevent memory bloat.

- **`manual_review.py`** & **`predict_from_folder.py`**:
  Deprecated interactive testing tools maintained for strict CLI pipeline debugging and unit test execution without utilizing the backend router API sequence.

- **`utils/fix_non_normalized_labels.py`**:
  A necessary data sanitizer that scans any imported text inputs and natively verifies coordinates fit perfectly mathematically into YOLO's required `<1.000` normalized ratio constraints before YOLO invokes.

- **`utils/cleanup_dataset_folders.py`**:
  An aggregation cleaner script to reset working environments.
