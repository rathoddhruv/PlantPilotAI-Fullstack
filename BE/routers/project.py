import os
import shutil
from pathlib import Path
from typing import List

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from BE.services.ml_service import ml_service
from ML.config_loader import REVIEW_QUEUE_DIR, TEMP_DIR

router = APIRouter()

@router.post("/upload")
async def upload_images(files: List[UploadFile] = File(...)):
    """
    Upload images for manual review and inference.
    
    Accepts raw images from the User Interface, bypasses immediate YOLO parsing
    to dump securely into the staging directory for the queue system.

    Writes to:
    - ML/data/test_images/ (Managed by REVIEW_QUEUE_DIR configuration)
    """
    uploaded_paths = []
    temp_dir = REVIEW_QUEUE_DIR
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
    """
    Initializes the PlantPilotAI environment from a Label Studio ZIP dataset.
    
    Accepts a compressed ZIP payload from the frontend, unpacks the dataset
    components securely, normalizes all annotations into internal schema, and
    triggers the primary foundational model training loop in the background.
    """
    # Save zip
    temp_zip = TEMP_DIR / file.filename
    temp_zip.parent.mkdir(parents=True, exist_ok=True)
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
    """
    Start neural model refinement loop using queued active-learning definitions.
    
    Acts as a background trigger wrapper around the monolithic
    active_learning_pipeline.py instance. Spawns pipeline synchronously inside 
    a managed thread context instead of blocking frontend API responses.
    """
    # Note: Fetch current settings or use defaults
    background_tasks.add_task(ml_service.run_training, epochs=epochs, imgsz=imgsz, model=model)
    return {"status": "success", "message": "Neural refinement started."}

@router.post("/annotate")
async def save_annotation(data: dict):
    """
    Saves reviewed detections and manual boxes from the review UI.

    The FE sends accepted detections, rejected detections, and manually
    drawn boxes. This route converts them into the label format used by
    the ML training pipeline.
    
    Transforms standard UI absolute bounding parameters natively backwards
    into normalized YOLO metrics.
    """
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
    """
    List filenames currently in the test queue awaiting manual review.
    
    Scans the UPLOADS/REVIEW target folders for pending structural files 
    that safely identify as renderable images.
    """
    temp_dir = REVIEW_QUEUE_DIR
    if not temp_dir.exists(): return {"files": []}
    files = [f.name for f in temp_dir.glob("*") if f.suffix.lower() in [".jpg", ".jpeg", ".png"]]
    return {"files": files}

@router.get("/classes")
def get_classes():
    """Extract class names from the currently loaded model and the global tracker."""
    from ML.config_loader import CLASS_FILE
    
    classes = set()
    
    # 1. Load from tracking file
    if CLASS_FILE.exists():
        for line in CLASS_FILE.read_text(encoding="utf-8").splitlines():
            if line.strip():
                classes.add(line.strip())
                
    # 2. Add from running model memory
    if not ml_service.model: 
        ml_service.load_model()
    
    if ml_service.model and hasattr(ml_service.model, 'names'):
        for val in ml_service.model.names.values():
            classes.add(str(val))
            
    return {"classes": list(classes)}

@router.get("/logs")
def get_logs():
    """Returns the current training log buffer."""
    return {"logs": ml_service.logs}

@router.post("/flush-staged")
def flush_staged():
    """Wipes the currently staged images and labels."""
    ml_service.flush_staged()
    return {"status": "success", "message": "Staged data cleared."}

# ========== BATCH PROCESSING ENDPOINTS ==========


@router.post("/batch/queue")
async def queue_annotation(data: dict):
    """
    Queue an annotation for batch processing instead of training immediately.

    Request body:
    {
        "filename": "image.jpg",
        "detections": [...],
        "width": 960,
        "height": 960,
        "label_type": "correct" | "false_positive" | "false_negative" | "low_confidence"
    }
    """
    try:
        result = ml_service.queue_annotation(
            filename=data["filename"],
            detections=data["detections"],
            width=data["width"],
            height=data["height"],
            label_type=data.get("label_type", "correct"),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch/reject")
async def reject_annotation(data: dict):
    """
    Reject an annotation and remove it from the batch queue.
    The image file will also be deleted.
    """
    try:
        result = ml_service.reject_annotation(data["filename"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch/status")
def get_batch_status():
    """Get current batch queue status and contents."""
    return ml_service.get_batch_status()


@router.post("/batch/accept-all")
async def accept_batch(
    background_tasks: BackgroundTasks,
    epochs: int = 40,
    imgsz: int = 960,
    model: str = "yolov8n.pt",
):
    """
    Accept all queued annotations, save them to training dataset,
    and trigger training automatically.
    """
    try:
        result = ml_service.accept_batch()

        if result["status"] == "success":
            # Trigger training in background
            background_tasks.add_task(
                ml_service.run_training, epochs=epochs, imgsz=imgsz, model=model
            )
            result["training"] = "queued_in_background"

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
