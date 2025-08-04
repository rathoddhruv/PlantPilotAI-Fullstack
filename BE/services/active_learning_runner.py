import subprocess
from pathlib import Path

ML_SCRIPT = Path("../ml/active_learning_pipeline.py").resolve()

def run_active_learning_pipeline():
    try:
        result = subprocess.run(
            ["python", str(ML_SCRIPT)],
            capture_output=True,
            text=True,
            check=True
        )
        return {"status": "success", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "error": e.stderr}
