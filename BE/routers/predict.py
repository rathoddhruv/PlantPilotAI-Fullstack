from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from pathlib import Path
import shutil

from settings import UPLOAD_DIR, LABEL_STUDIO_DIR
from services.active_learning_runner import import_labelstudio_export, run_active_learning_pipeline

router = APIRouter()

def _safe_name(name: str) -> str:
    # drop any path pieces and reject empty names
    name = Path(name or "").name
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="missing or invalid filename")
    return name

@router.post("/upload")
async def upload_files(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    - zip -> ml/label_studio_exports/<name>.zip  (import queued in background)
    - image -> ml/data/test_images/<name>
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
        background_tasks.add_task(import_labelstudio_export, dst)
        return {"status": "uploaded", "type": "labelstudio_zip", "import": "queued"}

    return {"status": "uploaded", "type": "image"}

@router.post("/run-pipeline")
def run_pipeline(mode: str = Form("active_learning"), confidence_threshold: float = Form(0.25)):
    return run_active_learning_pipeline(mode=mode, confidence_threshold=confidence_threshold)
