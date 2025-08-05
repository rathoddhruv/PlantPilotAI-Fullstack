import subprocess
from pathlib import Path
import os

ML_DIR = Path("../ml").resolve()
ML_SCRIPT = ML_DIR / "active_learning_pipeline.py"
IMPORT_SCRIPT = ML_DIR / "import_yolo_dataset_from_zip.py"

def import_labelstudio_export(zip_path: Path):
    """Run Label Studio YOLO import script for the given ZIP file."""
    try:
        result = subprocess.run(
            ["python", str(IMPORT_SCRIPT)],
            cwd=ML_DIR,
            env={**os.environ, "ZIP_PATH": str(zip_path)},
            capture_output=True,
            text=True,
            check=True,
        )
        return {"status": "success", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "error": e.stderr}

def run_active_learning_pipeline(mode="active_learning", confidence_threshold=0.25):
    """Runs the main active learning pipeline."""
    env = os.environ.copy()
    env["PIPELINE_MODE"] = mode
    env["UNCERTAIN_THRESHOLD"] = str(confidence_threshold)

    try:
        result = subprocess.run(
            ["python", str(ML_SCRIPT)],
            cwd=ML_DIR,
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        return {"status": "success", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "error": e.stderr}
