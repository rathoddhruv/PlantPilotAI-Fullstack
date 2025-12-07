from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from pathlib import Path
import shutil
from BE.settings import LABEL_STUDIO_DIR
from BE.services.ml_service import ml_service

router = APIRouter()

@router.post("/init")
async def initialize_project(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a Label Studio ZIP export and initialize the dataset.
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")

    LABEL_STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    destination = LABEL_STUDIO_DIR / file.filename
    
    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Run import immediately or background? 
    # For init, user might wait, but import can be slow. 
    # Let's run synchronously for 'init' to confirm success, or backgound if huge.
    # The user requirements say "User drags... backend extracts ... trains".
    # Training takes long. Extraction is fast. 
    # Let's extract sync, train async.
    
    try:
        # Extract and setup dataset
        ml_service.run_import_zip(destination)
        
        # Trigger initial training in background
        background_tasks.add_task(ml_service.run_training)
        
        return {"status": "success", "message": "Project initialized. Training started in background."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/train")
async def trigger_training(background_tasks: BackgroundTasks):
    """
    Manually trigger the active learning pipeline (retraining).
    """
    background_tasks.add_task(ml_service.run_training)
    return {"status": "success", "message": "Training started in background."}
