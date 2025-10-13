# routers/pipeline.py
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from datetime import datetime

from services.active_learning_runner import run_active_learning_pipeline
from services.runs_catalog import list_runs, rollback_to, read_manifest

router = APIRouter()

@router.post("/run")
def run_pipeline(
    mode: str = Query("active_learning", description="pipeline mode"),
    confidence_threshold: float = Query(0.25, ge=0.0, le=1.0, description="uncertainty threshold"),
):
    """
    run active learning as a child process and return status
    """
    result = run_active_learning_pipeline(mode=mode, confidence_threshold=confidence_threshold)
    if result.get("status") != "success":
        return JSONResponse(status_code=500, content=result)
    # augment with a minimal manifest event for FE timeline
    entry = {
        "event": "train_complete",
        "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S"),
        "mode": mode,
        "threshold": confidence_threshold,
    }
    # handled by the ML script too, but ok to double record
    return {"status": "success", "output": result.get("output", ""), "manifest_hint": entry}

@router.get("/runs")
def get_runs():
    """
    list current and archived runs with basic metrics
    """
    runs = list_runs()
    return {
        "status": "success",
        "count": len(runs),
        "runs": runs,
        "manifest": read_manifest(),
    }

@router.post("/rollback")
def rollback(run: str = Query(..., description="archive run name like train_YYYYmmdd_HHMMSS")):
    """
    replace current 'train' with a selected archived run
    """
    res = rollback_to(run)
    if res.get("status") != "success":
        raise HTTPException(status_code=404, detail=res.get("error", "rollback failed"))
    return res
