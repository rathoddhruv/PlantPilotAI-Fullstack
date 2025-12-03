# routers/uploads.py
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from pathlib import Path
import shutil

from BE.settings import UPLOAD_DIR, LABEL_STUDIO_DIR
from BE.services.active_learning_runner import import_labelstudio_export

router = APIRouter()

def _safe_name(name: str) -> str:
    # sanitize user supplied filename to avoid path traversal
    n = Path(name or "").name
    if not n or n in {".", ".."}:
        raise HTTPException(status_code=400, detail="missing or invalid filename")
    return n

@router.post("/file")
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    upload one file
    zip -> ml/label_studio_exports/<name>.zip (queued for import)
    image -> ml/data/test_images/<name> (directly available for quick tests)
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
        # import runs in background so api stays responsive
        background_tasks.add_task(import_labelstudio_export, dst)
        return {"status": "uploaded", "type": "labelstudio_zip", "import": "queued"}

    return {"status": "uploaded", "type": "image", "path": str(dst)}
