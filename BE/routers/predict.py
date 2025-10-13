from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse  # return proper http status codes
from pathlib import Path
import shutil
import subprocess, sys

from settings import UPLOAD_DIR, LABEL_STUDIO_DIR
from services.active_learning_runner import import_labelstudio_export, run_active_learning_pipeline

router = APIRouter()

def _safe_name(name: str) -> str:
    # sanitize user supplied filename to avoid path traversal
    name = Path(name or "").name
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="missing or invalid filename")
    return name

@router.post("/upload")
async def upload_files(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    zip -> ml/label_studio_exports/<name>.zip  (import queued in background)
    image -> ml/data/test_images/<name>
    why: keep a simple split so labelstudio zips are ingested later and images are ready for quick tests
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    LABEL_STUDIO_DIR.mkdir(parents=True, exist_ok=True)

    filename = _safe_name(file.filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    dst = (LABEL_STUDIO_DIR / filename) if ext == "zip" else (UPLOAD_DIR / filename)
    dst.parent.mkdir(parents=True, exist_ok=True)

    with dst.open("wb") as buf:
        shutil.copyfileobj(file.file, buf)

    if ext == "zip":
        # import runs in background so the api stays responsive
        background_tasks.add_task(import_labelstudio_export, dst)
        return {"status": "uploaded", "type": "labelstudio_zip", "import": "queued"}

    return {"status": "uploaded", "type": "image"}


@router.post("/run-pipeline")
def run_pipeline():
    """
    run the active learning pipeline as a child process
    why: isolate long running work from the api process and capture logs for debugging
    returns 200 on success and 500 with stderr on failure
    """
    try:
        script_path = Path("ml") / "active_learning_pipeline.py"
        abs_script_path = script_path.resolve()
        proc = subprocess.run(
            [sys.executable, str(abs_script_path)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            # surface stderr to help diagnose issues like missing packages or bad paths
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "error": proc.stderr.strip()
                    or "pipeline failed with non zero return code",
                },
            )
        return {"status": "ok"}
    except Exception as e:
        # unexpected launcher error, not a pipeline failure
        raise HTTPException(status_code=500, detail=str(e))
