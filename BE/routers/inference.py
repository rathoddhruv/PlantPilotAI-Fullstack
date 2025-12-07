from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
import shutil
import uuid
from BE.settings import UPLOAD_DIR
from BE.services.ml_service import ml_service

router = APIRouter()

@router.post("/predict")
async def predict_image(file: UploadFile = File(...)):
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
        detections = ml_service.predict(file_path)
        return {
            "filename": filename,
            "url": f"/static/uploads/{filename}", # Assuming we mount static
            "detections": detections
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
