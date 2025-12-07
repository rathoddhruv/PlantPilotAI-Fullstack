from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException, Form
from BE.settings import LABEL_STUDIO_DIR
from BE.services.ml_service import MLService
import shutil
import logging
import sys

logger = logging.getLogger(__name__)
router = APIRouter()
ml_service = MLService()

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

    try:
        logger.info(f"Project init called with file {file.filename}, epochs={epochs}, imgsz={imgsz}")
        
        # Extract and setup dataset
        ml_service.run_import_zip(destination)
        
        # Trigger initial training in background via thread
        logger.info("Starting training thread from /project/init")
        import threading
        t = threading.Thread(target=ml_service.run_training, args=(epochs, imgsz), daemon=True)
        t.start()
        
        return {"status": "success", "message": "Project initialized. Training started in background."}
    except Exception as e:
        logger.exception("Project initialization failed")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/train")
async def trigger_training(background_tasks: BackgroundTasks):
    """
    Manually trigger the active learning pipeline (retraining).
    """
    background_tasks.add_task(ml_service.run_training)
    return {"status": "success", "message": "Training started in background."}
