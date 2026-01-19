import os
import sys
import shutil
import subprocess
import argparse
import json
from pathlib import Path
from datetime import datetime
from config_loader import (
    MODEL_PATH as CONFIG_MODEL_PATH,
)
import torch
from multiprocessing import freeze_support

def get_device():
    return "0" if torch.cuda.is_available() else "cpu"

def _archive_existing_train():
    """move current runs/detect/train into runs/detect/archive/train_<timestamp>"""
    runs_root = Path("runs") / "detect"
    train_dir = runs_root / "train"
    if not train_dir.exists():
        return None
    archive = runs_root / "archive"
    archive.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = archive / f"train_{ts}"
    shutil.move(str(train_dir), str(dst))
    print(f"archived previous train to: {dst}")
    return dst


def _manifest_append(event: str, extra: dict):
    """append a small record to runs/detect/manifest.json; never fail the pipeline"""
    try:
        runs_detect = Path("runs") / "detect"
        runs_detect.mkdir(parents=True, exist_ok=True)
        mf = runs_detect / "manifest.json"
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
    
        dataset_yaml = YOLO_DATASET_YAML_ABS  # use absolute yaml path
    
        # remove leftover backup labels if any
        for txt_file in initial_labels.glob("*.bak"):
            txt_file.unlink()
    
        # always write artifacts to a stable folder under ml/runs/detect/train
        _archive_existing_train()  # move previous 'train' to archive if it exists
    
        print(f"Starting YOLO training with initial dataset using {args.model}...")
        
        # Use Python API instead of CLI to ensure correct Python environment with CUDA
        from ultralytics import YOLO
        
        # Check if model string is a path
        model_name = args.model
        if not model_name.endswith('.pt'):
             model_name += '.pt'
        
        task_type = get_task(model_name)
        print(f"Inferred task type: {task_type}")

        model = YOLO(model_name)
        device = get_device()  # "0" if CUDA available, else "cpu"
        
        try:
            results = model.train(
                task=task_type,
                data=str(dataset_yaml),
                imgsz=args.imgsz,  # Use CLI argument
                device=device,
                project="runs/detect",
                name="train",
                exist_ok=True,
                resume=False,
                val=False,
                epochs=args.epochs,  # Use CLI argument instead of hardcoded 100
                lr0=0.005
            )
            print("YOLO initial training completed successfully")
        except Exception as e:
            print(f"YOLO initial training failed: {e}")
            sys.exit(1)
    
        # verify artifacts exist before renaming the dataset
        best = Path("runs") / "detect" / "train" / "weights" / "best.pt"
        if not best.exists():
            print("No training artifacts found at", best)
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
        # search under ml/runs/detect only
        base_dir = Path(base_dir)
        if not base_dir.exists():
            raise FileNotFoundError(f"runs folder missing at {base_dir.resolve()}")
        run_dirs = sorted(
            [d for d in base_dir.iterdir() if d.is_dir()],
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        )
        for run_dir in run_dirs:
            best = run_dir / "weights/best.pt"
            if best.exists():
                return best
        raise FileNotFoundError("No valid best.pt found in any run folder.")
    
    
    
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
    print(f"Valid label files found: {len(valid_labels)}")
    
    unmatched_labels = []
    for label_file in valid_labels:
        image_file = merged_images / (label_file.stem + ".jpg")
        if not image_file.exists():
            unmatched_labels.append(label_file.name)
    
    if unmatched_labels:
        print("Some labels do not have matching images:")
        for f in unmatched_labels:
            print(f"  - {f}")
        print("Please fix missing image files before training.")
        sys.exit(1)
    
    if len(valid_labels) == 0:
        print("No valid label files found. Training skipped.")
        sys.exit(1)
    
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
        
        print(f"Found {len(train_images)} images and {len(train_labels)} labels.")
        # force stable save path under ml/runs/detect/train
        TRAIN_STABLE = Path("runs") / "detect" / "train"
        if TRAIN_STABLE.exists():
            shutil.rmtree(TRAIN_STABLE, ignore_errors=True)
    
        train_args = [
            sys.executable, "-m", "ultralytics", 
            "yolo",
            f"task={task_type}",
            "mode=train",
            f"model={MODEL_PATH}", # FIX: Use MODEL_PATH for fine-tuning!
            f"data={dataset_yaml}",
            f"imgsz={args.imgsz}",
            "device=0",
            "project=runs/detect",  # stable root
            "name=train",  # always 'train'
            "exist_ok=True",
            "resume=False",
            "val=False",
            f"epochs={args.epochs}",  # increased epochs for better training
            "lr0=0.005",   # initial learning rate
        ]
    
        print(f"Running YOLO training (Fine-tuning from {MODEL_PATH})...")
        result = subprocess.run(
            train_args,
            check=False # Allow it to fail without raising immediate exception, we handle returncode
        )
    
        if result.returncode != 0:
            print("YOLO training failed to execute properly.")
            print(result.stderr or result.stdout)
            sys.exit(1)
    
        # after training, backup old model and update MODEL_PATH with new best
        final_best = Path("runs/detect/train/weights/best.pt")
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
            print("Training finished, but no best.pt found at expected location.")
            print("Cleaning up broken run folder...")
            shutil.rmtree("runs/detect/train", ignore_errors=True)
    
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
        print(f"Evaluating {len(train_images)} images using updated model...")
        eval_args = [
            "yolo",
            "task=detect",
            "mode=predict",
            f"model={CONFIG_MODEL_PATH}",
            f"source={merged_images}",
            "imgsz=960",
            "conf=0.25",
            "iou=0.5",
            f"device={get_device()}",
            "show=False",
            "save=True",
            "save_txt=False",
            "project=eval_output",
            "name=post_active_learning",
            "exist_ok=True",
        ]
        subprocess.run(eval_args)
    else:
        print(f"Skipping evaluation because model not found at {CONFIG_MODEL_PATH}")
