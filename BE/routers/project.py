from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException
from pathlib import Path
import shutil
import os
from BE.services.ml_service import ml_service
from BE.settings import ML_DIR
from typing import List

router = APIRouter()

@router.post("/upload")
async def upload_images(files: List[UploadFile] = File(...)):
    """Upload images for immediate inference/review."""
    uploaded_paths = []
    temp_dir = ML_DIR / "data" / "test_images"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    for file in files:
        file_path = temp_dir / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        uploaded_paths.append(file.filename)
    
    return {"status": "success", "files": uploaded_paths}

@router.post("/init")
async def init_project(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    epochs: int = 100,
    imgsz: int = 960,
    model: str = "yolov8n.pt"
):
    """Full project initialization from Label Studio ZIP."""
    # Save zip
    temp_zip = ML_DIR / "temp" / file.filename
    temp_zip.parent.mkdir(exist_ok=True)
    with temp_zip.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Run sync import then background training
    try:
        ml_service.run_import_zip(temp_zip)
        background_tasks.add_task(ml_service.run_training, epochs=epochs, imgsz=imgsz, model=model)
        return {"status": "success", "message": "Import successful. Training started in background."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refine")
async def trigger_refinement(
    background_tasks: BackgroundTasks,
    epochs: int = 40,
    imgsz: int = 960,
    model: str = "yolov8n.pt"
):
    """Trigger active learning refinement on the currently staged data."""
    # Note: Fetch current settings or use defaults
    background_tasks.add_task(ml_service.run_training, epochs=epochs, imgsz=imgsz, model=model)
    return {"status": "success", "message": "Neural refinement started."}

@router.post("/annotate")
async def save_annotation(data: dict):
    """Save a verified annotation to the training set."""
    try:
        ml_service.save_annotation(
            filename=data['filename'],
            detections=data['detections'],
            width=data['width'],
            height=data['height']
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reset")
def reset_project(archive: bool = False):
    """Reset all project data (datasets, runs), optionally archiving."""
    ml_service.reset_project(archive=archive)
    return {"status": "success", "message": f"Project {'reset' if not archive else 'archived'} complete."}

@router.get("/staged-stats")
def get_staged_stats():
    """Returns counts of images/labels currently waiting in the merge folder."""
    return ml_service.get_staged_stats()

@router.get("/pending-images")
def get_pending_images():
    """List filenames currently in test_images awaiting review."""
    temp_dir = ML_DIR / "data" / "test_images"
    if not temp_dir.exists(): return {"files": []}
    files = [f.name for f in temp_dir.glob("*") if f.suffix.lower() in [".jpg", ".jpeg", ".png"]]
    return {"files": files}

@router.get("/classes")
def get_classes():
    """Extract class names from the currently loaded model."""
    if not ml_service.model: 
        ml_service.load_model()
    
    if ml_service.model and hasattr(ml_service.model, 'names'):
        return {"classes": list(ml_service.model.names.values())}
    return {"classes": []}

@router.get("/logs")
def get_logs():
    """Returns the current training log buffer."""
    return {"logs": ml_service.logs}

@router.post("/flush-staged")
def flush_staged():
    """Wipes the currently staged images and labels."""
    ml_service.flush_staged()
    return {"status": "success", "message": "Staged data cleared."}
