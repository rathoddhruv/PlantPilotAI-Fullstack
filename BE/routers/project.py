from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException, Form
from BE.settings import LABEL_STUDIO_DIR
from BE.services.ml_service import MLService
import shutil
import logging
import sys
import zipfile
import json
from pathlib import Path

logger = logging.getLogger(__name__)
router = APIRouter()
from BE.services.ml_service import ml_service

@router.post("/init")
def initialize_project(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    epochs: int = Form(40),
    imgsz: int = Form(960),
    model: str = Form("yolov8n.pt")
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
            ml_service.run_training(epochs=epochs, imgsz=imgsz, model=model)
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

class AnnotationRequest(json.BaseModel if 'BaseModel' in locals().get('pydantic', {}).__dir__() else object):
    pass 
# Wait, need Pydantic
from pydantic import BaseModel
from typing import List, Tuple

class DetectionBox(BaseModel):
    box: List[float] # x1, y1, x2, y2
    class_: str 
    # Mapped from 'class' in frontend, but check pydantic alias if needed. 
    # Actually frontend sends {class: "foo", box: []}. "class" is reserved keyword in python? no.

class AnnotationPayload(BaseModel):
    filename: str
    detections: List[dict]
    width: int
    height: int

@router.post("/annotate")
def save_annotation(payload: AnnotationPayload):
    """
    Save validated annotations and add image to training set.
    """
    try:
        ml_service.save_annotation(payload.filename, payload.detections, payload.width, payload.height)
        return {"status": "success", "message": "Annotation saved."}
    except Exception as e:
        logger.exception("Annotation save failed")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/logs")
def get_logs():
    """Return recent logs from the ML service."""
    return {"logs": ml_service.get_logs()}

@router.post("/inspect-zip")
async def inspect_zip(file: UploadFile = File(...)):
    """
    Inspect ZIP contents without processing.
    Returns image count and detected classes.
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")
    
    try:
        # Save temp file
        temp_path = LABEL_STUDIO_DIR / f"temp_{file.filename}"
        LABEL_STUDIO_DIR.mkdir(parents=True, exist_ok=True)
        
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Inspect ZIP
        image_count = 0
        classes = set()
        
        with zipfile.ZipFile(temp_path, 'r') as zf:
            for name in zf.namelist():
                # Count images
                if name.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
                    image_count += 1
                
                # Try to find Label Studio JSON
                if name.endswith('.json') and 'result' not in name:
                    try:
                        content = zf.read(name).decode('utf-8')
                        data = json.loads(content)
                        # Extract class names from Label Studio format
                        if isinstance(data, list):
                            for item in data:
                                if 'annotations' in item:
                                    for ann in item['annotations']:
                                        if 'result' in ann:
                                            for res in ann['result']:
                                                if 'value' in res and 'rectanglelabels' in res['value']:
                                                    classes.update(res['value']['rectanglelabels'])
                    except:
                        pass
        
        # Clean up temp file
        temp_path.unlink()
        
        return {
            "image_count": image_count,
            "classes": sorted(list(classes)) if classes else [],
            "file_size_mb": round(temp_path.stat().st_size / (1024 * 1024), 2) if temp_path.exists() else 0
        }
    except Exception as e:
        logger.exception("ZIP inspection failed")
        raise HTTPException(status_code=500, detail=f"Failed to inspect ZIP: {str(e)}")

@router.post("/reset")
def reset_project():
    """Reset all project data (datasets, runs)."""
    ml_service.reset_project()
    return {"status": "success", "message": "Project reset complete."}
