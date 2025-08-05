from fastapi import APIRouter, UploadFile, File, Form
from pathlib import Path
from services.active_learning_runner import (
    run_active_learning_pipeline,
    import_labelstudio_export,
)
import shutil

router = APIRouter()

# Folders
UPLOAD_DIR = Path("../ml/data/test_images").resolve()
LABEL_STUDIO_DIR = Path("../ml/label_studio_exports").resolve()


@router.post("/upload")
async def upload_files(file: UploadFile = File(...)):
    """
    Accepts either:
    - An image (goes to test_images/)
    - A ZIP of a Label Studio YOLO export (goes to label_studio_exports/)
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    LABEL_STUDIO_DIR.mkdir(parents=True, exist_ok=True)

    file_ext = file.filename.split(".")[-1].lower()
    file_path = (
        (LABEL_STUDIO_DIR / file.filename)
        if file_ext == "zip"
        else (UPLOAD_DIR / file.filename)
    )

    if file_ext == "zip":
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        result = import_labelstudio_export(file_path)
        return {"status": "uploaded", "type": "labelstudio_zip", "result": result}

    # handle non-zip images
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "uploaded", "type": "image"}


@router.post("/import-labelstudio")
def import_labelstudio():
    """
    Runs the Label Studio → YOLO dataset import process.
    This will populate data/yolo_dataset with images + labels from the latest ZIP.
    """
    result = import_labelstudio_export(LABEL_STUDIO_DIR)
    return result


@router.post("/run-pipeline")
def run_pipeline(
    mode: str = Form("active_learning"), confidence_threshold: float = Form(0.25)
):
    """
    Runs the full active learning pipeline.
    Mode and confidence_threshold are passed as environment variables.
    """
    result = run_active_learning_pipeline(
        mode=mode, confidence_threshold=confidence_threshold
    )
    return result
