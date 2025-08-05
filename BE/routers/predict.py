from fastapi import APIRouter, UploadFile, File, Form
from pathlib import Path
from services.active_learning_runner import (
    run_active_learning_pipeline,
    import_labelstudio_export,
)
import shutil

router = APIRouter()

UPLOAD_DIR = Path("../ml/data/test_images").resolve()
LABEL_STUDIO_DIR = Path("../ml/label_studio_exports").resolve()

@router.post("/upload")
async def upload_files(file: UploadFile = File(...)):
    """
    Accepts:
    - Image → saved to test_images/
    - Label Studio ZIP export → saved to label_studio_exports/ and imported immediately
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    LABEL_STUDIO_DIR.mkdir(parents=True, exist_ok=True)

    file_ext = file.filename.split(".")[-1].lower()
    file_path = (
        (LABEL_STUDIO_DIR / file.filename)
        if file_ext == "zip"
        else (UPLOAD_DIR / file.filename)
    )

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if file_ext == "zip":
        result = import_labelstudio_export(file_path)  # pass actual ZIP path
        return {"status": "uploaded", "type": "labelstudio_zip", "result": result}

    return {"status": "uploaded", "type": "image"}

@router.post("/run-pipeline")
def run_pipeline(
    mode: str = Form("active_learning"), confidence_threshold: float = Form(0.25)
):
    """
    Runs the full active learning pipeline.
    """
    result = run_active_learning_pipeline(
        mode=mode, confidence_threshold=confidence_threshold
    )
    return result
