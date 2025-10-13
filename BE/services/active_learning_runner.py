# services/active_learning_runner.py
import subprocess, os, sys
from pathlib import Path
from settings import ML_DIR, ML_PIPELINE, IMPORT_ZIP_SCRIPT
from services.textutils import strip_ansi


def import_labelstudio_export(zip_path: Path):
    """
    run the zip import script as a child process
    why: isolate data ingestion from api process and keep logs readable
    """
    env = os.environ.copy()
    env["ZIP_PATH"] = str(zip_path)
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    return _run(IMPORT_ZIP_SCRIPT, env)


def run_active_learning_pipeline(
    mode: str = "active_learning", confidence_threshold: float = 0.25
):
    """
    run the active learning pipeline end to end
    why: keep router thin; all process concerns live here
    """
    env = os.environ.copy()
    env["PIPELINE_MODE"] = mode
    env["UNCERTAIN_THRESHOLD"] = str(confidence_threshold)
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    return _run(ML_PIPELINE, env)


def _run(script: Path, env: dict):
    """
    helper to execute a python script in ml dir and capture output
    """
    try:
        r = subprocess.run(
            [sys.executable, str(script)],
            cwd=ML_DIR,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",  # <— force UTF-8 decode of stdout/stderr
            errors="replace",  # <— never crash on weird bytes
            check=True,
        )
        return {"status": "success", "output": r.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "error": e.stderr or e.stdout}
