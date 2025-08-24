import subprocess
import os
from pathlib import Path
from settings import ML_DIR, ML_PIPELINE, IMPORT_ZIP_SCRIPT

def import_labelstudio_export(zip_path: Path):
    """run the yolo dataset import script for a given ZIP file path"""
    try:
        result = subprocess.run(
            ["python", str(IMPORT_ZIP_SCRIPT)],
            cwd=ML_DIR,                                  # run inside ml/
            env={**os.environ, "ZIP_PATH": str(zip_path)},
            capture_output=True,
            text=True,
            check=True,
        )
        return {"status": "success", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "error": e.stderr}

def run_active_learning_pipeline(mode="active_learning", confidence_threshold=0.25):
    """kick off the main pipeline with env overrides"""
    env = os.environ.copy()
    env["PIPELINE_MODE"] = mode
    env["UNCERTAIN_THRESHOLD"] = str(confidence_threshold)

    try:
        result = subprocess.run(
            ["python", str(ML_PIPELINE)],
            cwd=ML_DIR,                    # run inside ml/
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        return {"status": "success", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "error": e.stderr}
