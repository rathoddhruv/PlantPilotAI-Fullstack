from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException, Form
from BE.settings import LABEL_STUDIO_DIR
from BE.services.ml_service import MLService
import shutil
import logging
import sys

logger = logging.getLogger(__name__)
router = APIRouter()
from BE.services.ml_service import ml_service

@router.post("/init")
def initialize_project(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    epochs: int = Form(40),
    imgsz: int = Form(960)
):
    """
    Upload a Label Studio ZIP export and initialize the dataset.
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")

    LABEL_STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    destination = LABEL_STUDIO_DIR / file.filename
    
    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    logger.info(f"Project init called with file {file.filename}, epochs={epochs}, imgsz={imgsz}")
    
    def _background_process():
        try:
            # Extract and setup dataset
            ml_service.run_import_zip(destination)
            # Trigger training
            ml_service.run_training(epochs=epochs, imgsz=imgsz)
        except Exception as e:
            logger.exception("Background process failed")
            ml_service.log_message(f"Background process error: {str(e)}")

    # Trigger background thread for both import and training
    logger.info("Starting background import/train thread")
    import threading
    t = threading.Thread(target=_background_process, daemon=True)
    t.start()
    
    return {"status": "success", "message": "Project initialized. Processing and training started in background."}

@router.post("/train")
async def trigger_training(background_tasks: BackgroundTasks):
    """
    Manually trigger the active learning pipeline (retraining).
    """
    background_tasks.add_task(ml_service.run_training)
    return {"status": "success", "message": "Training started in background."}

@router.get("/logs")
def get_logs():
    """Return recent logs from the ML service."""
    return {"logs": ml_service.get_logs()}

@router.post("/reset")
def reset_project():
    """Reset all project data (datasets, runs)."""
    ml_service.reset_project()
    return {"status": "success", "message": "Project reset complete."}
