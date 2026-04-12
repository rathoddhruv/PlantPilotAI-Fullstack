from fastapi import FastAPI, UploadFile, File, HTTPException
from pathlib import Path
import shutil
import uuid
import sys

# Add project root to sys.path
root = Path(__file__).resolve().parent
sys.path.append(str(root))

from BE.services.ml_service import ml_service
from BE.settings import UPLOAD_DIR

app = FastAPI()

@app.post("/test-predict")
def test_predict(file: UploadFile = File(...)):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = UPLOAD_DIR / filename
    
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        res = ml_service.predict(file_path)
        return {"res": res}
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
