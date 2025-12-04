# BE/routers/pipeline.py
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from datetime import datetime
import subprocess, sys
from pathlib import Path
from BE.services.runs_catalog import list_runs, rollback_to, read_manifest

router = APIRouter()

# point to real ml folder (outside BE)
ML_DIR = Path(__file__).resolve().parents[2] / "ML"


@router.post("/init")
def pipeline_init():
    """run initial training from Label Studio export"""
    try:
        result = subprocess.run(
            [sys.executable, str(ML_DIR / "pipeline_initial.py")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            return JSONResponse(
                status_code=500, content={"status": "error", "error": result.stderr}
            )
        entry = {
            "event": "initial_train_complete",
            "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S"),
        }
        return {"status": "ok", "output": result.stdout, "manifest_hint": entry}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run")
def pipeline_run(
    mode: str = Query("active_learning", description="pipeline mode"),
    confidence_threshold: float = Query(0.25, ge=0.0, le=1.0),
):
    """run active learning retrain"""
    try:
        result = subprocess.run(
            [sys.executable, str(ML_DIR / "pipeline_active_learning.py")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            return JSONResponse(
                status_code=500, content={"status": "error", "error": result.stderr}
            )
        entry = {
            "event": "train_complete",
            "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S"),
            "mode": mode,
            "threshold": confidence_threshold,
        }
        return {"status": "ok", "output": result.stdout, "manifest_hint": entry}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs")
def get_runs():
    """list all previous runs and manifest info"""
    runs = list_runs()
    return {
        "status": "success",
        "count": len(runs),
        "runs": runs,
        "manifest": read_manifest(),
    }


@router.post("/rollback")
def rollback(run: str = Query(..., description="archive run name like train_YYYYmmdd_HHMMSS")):
    """rollback current train to a selected archived version"""
    res = rollback_to(run)
    if res.get("status") != "success":
        raise HTTPException(status_code=404, detail=res.get("error", "rollback failed"))
    return res
