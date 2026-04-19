import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import torch
from config_loader import MODEL_PATH as CONFIG_MODEL_PATH
from ultralytics import YOLO

# Disable emojis for Windows terminal compatibility
USE_EMOJI = False
from multiprocessing import freeze_support

# Constants for absolute pathing
ML_DIR = Path(__file__).resolve().parent
ROOT_DIR = ML_DIR.parent
RUNS_DETECT = ROOT_DIR / "runs" / "detect"
TRAIN_STABLE = RUNS_DETECT / "train"

def get_device():
    return "0" if torch.cuda.is_available() else "cpu"

def _archive_existing_train():
    """move current runs/detect/train into runs/detect/archive/train_<timestamp>"""
    if not TRAIN_STABLE.exists():
        return None
    archive = RUNS_DETECT / "archive"
    archive.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = archive / f"train_{ts}"
    shutil.move(str(TRAIN_STABLE), str(dst))
    print(f"archived previous train to: {dst}")
    return dst


def _manifest_append(event: str, extra: dict):
    """append a small record to runs/detect/manifest.json; never fail the pipeline"""
    try:
        RUNS_DETECT.mkdir(parents=True, exist_ok=True)
        mf = RUNS_DETECT / "manifest.json"
        data = []
        if mf.exists():
            try:
                data = json.loads(mf.read_text(encoding="utf-8"))
                if not isinstance(data, list):
                    data = []
            except Exception:
                data = []
        rec = {"event": event, "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S")}
        rec.update(extra or {})
        mf.write_text(json.dumps([*data, rec], indent=2), encoding="utf-8")
    except Exception as e:
        print(f"Manifest append failed: {e}")  # do not break training if manifest fails


def _sync_yaml(yaml_path: Path, data_path: Path):
    """Update YAML path and names from classes.txt; data_path relative to ml/"""
    try:
        classes_file = data_path / "classes.txt"
        if not classes_file.exists():
            classes_file = data_path / "labels" / "train" / "classes.txt"
        
        names_dict = {}
        if classes_file.exists():
            lines = classes_file.read_text(encoding="utf-8").splitlines()
            names_dict = {i: line.strip() for i, line in enumerate(lines) if line.strip()}
        
        if not names_dict:
            # Fallback for safe training
            names_dict = {0: "object"}
            
        content = [
            f"path: {data_path.as_posix()}",
            "train: images/train",
            "val: images/train",
            "names:",
        ]
        for idx, nm in names_dict.items():
            content.append(f"  {idx}: {nm}")
            
        yaml_path.write_text("\n".join(content), encoding="utf-8")
        print(f"Synced {yaml_path.name} to {data_path} with {len(names_dict)} classes.")
    except Exception as e:
        print(f"⚠️ YAML Sync failed: {e}")

if __name__ == '__main__':
    # Required for Windows multiprocessing
    freeze_support()

    print("=== STARTING ACTIVE LEARNING PIPELINE ===")

    # lock cwd to this ml folder so relative paths never jump to an old repo
    THIS_DIR = Path(__file__).resolve().parent
    os.chdir(THIS_DIR)

    # absolute yaml paths avoid accidental cross-repo references
    YOLO_DATASET_YAML_ABS = str((THIS_DIR / "yolo_dataset.yaml").resolve())
    YOLO_MERGED_YAML_ABS = str((THIS_DIR / "yolo_merged.yaml").resolve())

    def update_yaml_path(yaml_path, rel_data_path):
        """Force absolute path in YAML to avoid Ultralytics settings interference"""
        try:
            p = Path(yaml_path)
            if not p.exists(): return

            lines = p.read_text(encoding='utf-8').splitlines()
            new_lines = []

            abs_data_path = (THIS_DIR / rel_data_path).resolve()

            path_updated = False
            for line in lines:
                if line.strip().startswith('path:'):
                    new_lines.append(f"path: {abs_data_path}")
                    path_updated = True
                else:
                    new_lines.append(line)

            if not path_updated:
                # If path key was missing, prepend it
                new_lines.insert(0, f"path: {abs_data_path}")

            p.write_text("\n".join(new_lines), encoding='utf-8')
            print(f"Updated {yaml_path} with absolute path: {abs_data_path}")
        except Exception as e:
            print(f"Failed to update YAML path: {e}")

    # Ensure YAMLs point to the correct absolute paths
    update_yaml_path(YOLO_DATASET_YAML_ABS, "data/yolo_dataset")
    update_yaml_path(YOLO_MERGED_YAML_ABS, "data/yolo_merged")

    # === CLI args ===
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--clean", action="store_true", help="Clean dataset folders before pipeline"
    )
    parser.add_argument(
        "--no-interactive", action="store_true", help="Skip manual review (API mode)"
    )
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=960, help="Image size for training")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Base model (e.g. yolov8n.pt, yolov8s.pt)")
    args = parser.parse_args()

    def get_task(model_name: str) -> str:
        if "obb" in model_name:
            return "obb"
        if "seg" in model_name:
            return "segment"
        return "detect"

    # === Step 0.5: Handle initial training from Label Studio dataset ===
    # if original dataset is present, train once, then rename folder to avoid retraining
    dataset_root = Path("data/yolo_merged")
    dataset_yaml = YOLO_MERGED_YAML_ABS

    initial_images = Path("data/yolo_dataset/images/train")
    initial_labels = Path("data/yolo_dataset/labels/train")

    # Check if directories exist before trying to glob
    valid_initial_labels = []
    if initial_labels.exists():
        valid_initial_labels = [f for f in initial_labels.glob("*.txt") if f.stat().st_size > 0]

    if initial_images.exists() and any(initial_images.glob("*")) and valid_initial_labels:
        print(
            "Detected initial Label Studio dataset. Training from yolo_dataset directly..."
        )

        _sync_yaml(Path(YOLO_DATASET_YAML_ABS), Path("data/yolo_dataset"))
        dataset_yaml = YOLO_DATASET_YAML_ABS  # use absolute yaml path

        # remove leftover backup labels if any
        for txt_file in initial_labels.glob("*.bak"):
            txt_file.unlink()

        # ALWAYS normalize Label Studio coordinates as it often exports in pixels
        print("Normalizing initial Label Studio dataset coordinates...")
        # Redirect to utils/fix_non_normalized_labels.py with a target directory?
        # Actually our script currently hardcodes the path. Let's run it.
        # But we need to make sure those folders match what the script expects.

        # The script expects 'data/yolo_merged'. Let's temporarily copy yolo_dataset to yolo_merged?
        # Actually, let's just run a simple manual normalization here for safety.
        from utils.fix_non_normalized_labels_logic import normalize_folder
        normalize_folder(initial_images, initial_labels)

        # always write artifacts to a stable folder under ml/runs/detect/train
        _archive_existing_train()  # move previous 'train' to archive if it exists

        print(f"Starting YOLO training with initial dataset using {args.model}...")

        # Use Python API instead of CLI to ensure correct Python environment with CUDA
        from ultralytics import YOLO

        # Check if model string is a path
        model_name = args.model
        if not model_name.endswith('.pt'):
            model_name += '.pt'

        # Handle the common typo 'yolov11' (official is 'yolo11')
        if model_name.startswith('yolov11'):
            alt_name = model_name.replace('yolov11', 'yolo11')
            if not Path(model_name).exists() and Path(alt_name).exists():
                print(f"Falling back from {model_name} to {alt_name}")
                model_name = alt_name

        task_type = get_task(model_name)
        print(f"Inferred task type: {task_type}")

        model = YOLO(model_name)
        device = get_device()  # "0" if CUDA available, else "cpu"

        try:
            results = model.train(
                task=task_type,
                data=str(dataset_yaml),
                imgsz=args.imgsz,
                device=device,
                project=str(RUNS_DETECT),
                name="train",
                exist_ok=True,
                resume=False,
                val=False,
                epochs=args.epochs,
                lr0=0.005,
                amp=False
            )
            print("YOLO initial training completed successfully")
        except Exception as e:
            print(f"YOLO initial training failed: {e}")
            sys.exit(1)

        # verify artifacts exist before renaming the dataset
        best = RUNS_DETECT / "train" / "weights" / "best.pt"
        if not best.exists():
            print(f"No training artifacts found at {best}")
            sys.exit(1)

        # record manifest for the one-time initial training
        _manifest_append(
            "initial_train",
            {"save_dir": str((Path("runs") / "detect" / "train").resolve())},
        )

        # rename dataset so it is not reused accidentally
        USED_PATH = Path("data/yolo_dataset_used")
        if USED_PATH.exists():
            shutil.rmtree(USED_PATH)
        shutil.move("data/yolo_dataset", USED_PATH)
        print("Renamed yolo_dataset -> yolo_dataset_used")

        print("Restart the script to continue active learning phase from merged labels")
        sys.exit(0)
    else:
        print("No initial dataset found. Proceeding with active learning flow...")
        dataset_yaml = YOLO_MERGED_YAML_ABS

    # === Step 1: optional dataset cleanup ===
    if args.clean:
        print("Cleaning dataset folders before starting pipeline...")
        subprocess.run([sys.executable, "utils/cleanup_dataset_folders.py"])
    else:
        print("Skipping dataset cleanup (default behavior, no --clean flag)")

    merged_images = dataset_root / "images/train"
    merged_labels = dataset_root / "labels/train"
    train_images = list(merged_images.glob("*"))
    train_labels = list(merged_labels.glob("*.txt"))

    # === Step 2: get latest trained model path ===
    def get_latest_model_path(base_dir="runs/detect"):
        # search recursively under ml/runs/detect to find any best.pt
        base_dir = Path(base_dir)
        if not base_dir.exists():
            base_dir.mkdir(parents=True, exist_ok=True)

        all_models = list(base_dir.rglob("best.pt"))
        if not all_models:
            # Fallback: check if the user provided a model to start with
            if args.model and Path(args.model).exists():
                return Path(args.model)
            raise FileNotFoundError("No valid best.pt found in any run folder.")

        # Sort by modification time to get the truly latest model
        all_models.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        return all_models[0]

    try:
        MODEL_PATH = get_latest_model_path()
        print(f"MODEL USED: {MODEL_PATH}")
    except Exception as e:
        print(f"No trained model found: {e}")
        print("Active learning requires an existing trained model.")
        print("Please upload a Label Studio ZIP file first to create the initial dataset.")
        sys.exit(0)  # Exit gracefully, not an error

    # === Step 3: launch manual review phase ===
    # === Step 3: launch manual review phase ===
    if not args.no_interactive:
        print("Launching manual_review.py...")
        try:
            subprocess.run([sys.executable, "manual_review.py"], check=True)
        except Exception as e:
            print(f"manual_review.py failed: {e}")
            sys.exit(1)
    else:
        print("Skipping manual_review.py (no-interactive mode).")

    # === Step 4: merge labels after review ===
    print("Running boost_merge_labels.py...")
    if subprocess.run([sys.executable, "boost_merge_labels.py"]).returncode != 0:
        print("boost_merge_labels.py failed")
        sys.exit(1)

    # === Step 5: archive existing stable train (keep history) ===
    _archived = _archive_existing_train()
    if _archived:
        print("archived old stable model; ready for new training into runs/detect/train")

    # === Step 6: validate labels and images ===
    valid_labels = [f for f in merged_labels.glob("*.txt") if f.stat().st_size > 0]
    print(f"Total potential labels found: {len(valid_labels)}")

    final_train_pairs = []
    for label_file in valid_labels:
        # Check for multiple extensions
        found_img = None
        for ext in ['.jpg', '.png', '.jpeg', '.JPG']:
            img_cand = merged_images / (label_file.stem + ext)
            if img_cand.exists():
                found_img = img_cand
                break

        if found_img:
            final_train_pairs.append((found_img, label_file))
        else:
            print(f"[WARN] Skipping {label_file.name} - No matching image found.")

    if len(final_train_pairs) == 0:
        print("[FAIL] No valid image+label pairs found. Training aborted.")
        sys.exit(1)

    print(f"[OK] Ready for refinement with {len(final_train_pairs)} validated pairs.")
    # Update train_images and train_labels counts for the next steps
    train_images = [p[0] for p in final_train_pairs]
    train_labels = [p[1] for p in final_train_pairs]

    # remove old backup txt files if left
    for txt_file in merged_labels.glob("*.bak"):
        txt_file.unlink()
        print(f"Deleted leftover backup file: {txt_file.name}")

    # === Step 7: normalize label coordinates ===
    print("Normalizing label coordinates before training...")

    # make the backup folder empty to avoid FileExistsError on Windows
    backup_dir = Path(str(dataset_root)) / "labels" / "backup_non_normalized" # fixed variable name
    shutil.rmtree(backup_dir, ignore_errors=True)
    backup_dir.mkdir(parents=True, exist_ok=True)

    subprocess.run([sys.executable, "utils/fix_non_normalized_labels.py"], check=True)

    # === Step 8: run training again if data available ===
    if not train_images or not train_labels:
        print("No training data found. Skipping training.")
    else:
        # Determine task for fine-tuning based on MODEL_PATH (which might not have name)
        # Or better, use args.model since we assume consistent model family?
        # Actually, if we are fine-tuning `best.pt`, we don't know if it's OBB/SEG from the filename 'best.pt'.
        # However, we can use args.model as a hint, assuming user keeps using same architecture.
        # Or `get_task` on `args.model`.
        task_type = get_task(args.model) 

        # SYNC YAML BEFORE FINE-TUNING!
        _sync_yaml(Path(YOLO_MERGED_YAML_ABS), Path("data/yolo_merged"))
        dataset_yaml = YOLO_MERGED_YAML_ABS

        print(f"Found {len(train_images)} images and {len(train_labels)} labels.")
        # force stable save path under ml/runs/detect/train
        TRAIN_STABLE = Path("runs") / "detect" / "train"
        if TRAIN_STABLE.exists():
            shutil.rmtree(TRAIN_STABLE, ignore_errors=True)

        print(f"Running YOLO training (Fine-tuning from {MODEL_PATH})...")
        model = YOLO(str(MODEL_PATH))
        device = get_device()

        try:
            # Use absolute paths for YOLO training
            abs_runs_detect = RUNS_DETECT.resolve()
            results = model.train(
                task=task_type,
                data=str(dataset_yaml),
                imgsz=args.imgsz,
                device=device,
                project=str(abs_runs_detect),
                name="train",
                exist_ok=True,
                resume=False,
                val=False,
                epochs=args.epochs,
                lr0=0.005,
                amp=False,
            )
            print("YOLO refinement training completed successfully")
        except Exception as e:
            print(f"YOLO refinement training failed: {e}")
            sys.exit(1)

        # after training, backup old model and update MODEL_PATH with new best
        # Check the trained weights location (absolute path)
        final_best = (RUNS_DETECT / "train" / "weights" / "best.pt").resolve()
        target_model = CONFIG_MODEL_PATH
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_model = Path(f"temp/last_model_{timestamp}.pt")

        if final_best.exists():
            backup_model.parent.mkdir(parents=True, exist_ok=True)
            if target_model.exists() and final_best.resolve() != target_model.resolve():
                shutil.copy2(target_model, backup_model)
                print(f"Backed up old model to: {backup_model}")
            if final_best.resolve() != target_model.resolve():
                shutil.copy2(final_best, target_model)
                print(f"Updated MODEL_PATH with new best.pt: {target_model}")
            else:
                print("Skipping model copy because target is already latest.")
        else:
            print(f"⚠️ Training finished, but best.pt not found at: {final_best}")
            print(
                f"Checking if training failed or weights are at different location..."
            )
            # Try to find any best.pt in runs/detect
            found_weights = list(RUNS_DETECT.rglob("best.pt"))
            if found_weights:
                print(f"Found best.pt at: {found_weights[0]}")
                final_best = found_weights[0]
                if final_best.resolve() != target_model.resolve():
                    shutil.copy2(final_best, target_model)
                    print(f"Updated MODEL_PATH with found best.pt: {target_model}")
            else:
                print("No best.pt found anywhere. Cleaning up broken run folder...")
                shutil.rmtree("runs/detect/train", ignore_errors=True)
                sys.exit(1)

        _manifest_append(
            "active_learning_train",
            {
                "save_dir": str((Path("runs") / "detect" / "train").resolve()),
                "images": len(train_images),
                "labels": len(train_labels),
            },
        )

    # === Step 9: run evaluation after training ===
    eval_dir = Path("eval_output")
    shutil.rmtree(eval_dir / "post_active_learning", ignore_errors=True)
    eval_dir.mkdir(parents=True, exist_ok=True)

    if CONFIG_MODEL_PATH.exists():
        print(f"Evaluating images using updated model...")
        model = YOLO(str(CONFIG_MODEL_PATH))
        try:
            results = model.predict(
                source=str(merged_images),
                imgsz=960,
                conf=0.25,
                iou=0.5,
                device=get_device(),
                save=True,
                project=str(eval_dir),
                name="post_active_learning",
                exist_ok=True
            )
            print("Evaluation completed successfully.")
        except Exception as e:
            print(f"Evaluation failed: {e}")
    else:
        print(f"Skipping evaluation because model not found at {CONFIG_MODEL_PATH}")
