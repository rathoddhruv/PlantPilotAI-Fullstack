from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pathlib import Path
import shutil
import uuid
from BE.settings import UPLOAD_DIR
from BE.services.ml_service import ml_service

router = APIRouter()

@router.post("/predict")
def predict_image(file: UploadFile = File(...), conf: float = Form(0.25)):
    """
    Upload an image and get predictions.
    """
    # Validate image
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # Use UUID to avoid collisions
    filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = UPLOAD_DIR / filename
    
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        detections = ml_service.predict(file_path, conf=conf)
        return {
            "filename": filename,
            "url": f"/uploads/{filename}", 
            "detections": detections
        }
    except Exception as e:
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=error_detail)
