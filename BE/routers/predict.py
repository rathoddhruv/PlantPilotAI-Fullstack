from fastapi import APIRouter
from services.active_learning_runner import run_active_learning_pipeline

router = APIRouter()

@router.post("/start")
def start_pipeline():
    result = run_active_learning_pipeline()
    return result
