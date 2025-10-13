# services/runs_catalog.py
from pathlib import Path
from datetime import datetime
import csv
import shutil
import json
import re

from settings import ML_DIR

RUNS_DETECT = (ML_DIR / "runs" / "detect").resolve()
CURRENT = RUNS_DETECT / "train"
ARCHIVE = RUNS_DETECT / "archive"
MANIFEST = RUNS_DETECT / "manifest.json"

_NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")

def _safe_float(v):
    try:
        s = str(v).strip()
        if not s or s.lower() in {"nan", "none"}:
            return None
        if _NUM_RE.match(s):
            return float(s)
        return None
    except Exception:
        return None

def _read_metrics(run_dir: Path):
    """read last row of results.csv if present"""
    csv_path = run_dir / "results.csv"
    if not csv_path.exists():
        return {}
    try:
        with csv_path.open("r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            return {}
        last = rows[-1]
        # support common ultralytics keys
        keys = {
            "precision": ["metrics/precision", "metrics/precision(B)", "precision"],
            "recall": ["metrics/recall", "recall"],
            "map50": ["metrics/mAP50(B)", "metrics/mAP50", "mAP50"],
            "map50_95": ["metrics/mAP50-95(B)", "metrics/mAP50-95", "mAP50-95"],
            "box_loss": ["box_loss", "train/box_loss"],
            "cls_loss": ["cls_loss", "train/cls_loss"],
            "dfl_loss": ["dfl_loss", "train/dfl_loss"],
        }
        out = {}
        for k, aliases in keys.items():
            for a in aliases:
                if a in last:
                    out[k] = _safe_float(last[a])
                    break
        return {k: v for k, v in out.items() if v is not None}
    except Exception:
        return {}

def _read_args(run_dir: Path):
    """read a few fields from args.yaml if present"""
    args_yaml = run_dir / "args.yaml"
    if not args_yaml.exists():
        return {}
    try:
        try:
            import yaml  # optional
            data = yaml.safe_load(args_yaml.read_text(encoding="utf-8"))
        except Exception:
            # naive parse fallback
            data = {}
            for line in args_yaml.read_text(encoding="utf-8").splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    data[k.strip()] = v.strip()
        return {
            "data": str(data.get("data", "")),
            "model": str(data.get("model", "")),
            "epochs": _safe_float(data.get("epochs")),
            "imgsz": _safe_float(data.get("imgsz")),
            "device": str(data.get("device", "")),
            "save_dir": str(data.get("save_dir", "")),
            "name": str(data.get("name", "")),
        }
    except Exception:
        return {}

def _run_info(run_dir: Path, kind: str):
    best = run_dir / "weights" / "best.pt"
    last = run_dir / "weights" / "last.pt"
    info = {
        "kind": kind,  # "current" or "archive"
        "name": run_dir.name,
        "path": str(run_dir.resolve()),
        "mtime": run_dir.stat().st_mtime if run_dir.exists() else None,
        "weights": {
            "best": str(best) if best.exists() else None,
            "last": str(last) if last.exists() else None,
        },
        "metrics": _read_metrics(run_dir),
        "args": _read_args(run_dir),
    }
    return info

def list_runs():
    """return current + archived runs sorted by mtime desc"""
    runs = []
    if CURRENT.exists():
        runs.append(_run_info(CURRENT, kind="current"))
    if ARCHIVE.exists():
        for d in ARCHIVE.iterdir():
            if d.is_dir() and (d / "weights").exists():
                runs.append(_run_info(d, kind="archive"))
    runs.sort(key=lambda x: x.get("mtime") or 0, reverse=True)
    return runs

def rollback_to(run_name: str):
    """replace CURRENT with a copy of ARCHIVE/run_name; archive CURRENT first"""
    src = ARCHIVE / run_name
    if not src.exists() or not (src / "weights" / "best.pt").exists():
        return {"status": "error", "error": f"archive run not found: {src}"}

    ARCHIVE.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    if CURRENT.exists():
        dst_prev = ARCHIVE / f"train_{ts}_prev"
        shutil.move(str(CURRENT), str(dst_prev))

    shutil.copytree(src, CURRENT)  # recreate stable current
    _append_manifest({
        "event": "rollback",
        "timestamp": ts,
        "from_archive": str(src),
        "to_current": str(CURRENT),
    })
    return {"status": "success", "current": _run_info(CURRENT, "current")}

def _append_manifest(entry: dict):
    """append one entry to manifest.json (list)"""
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    data = []
    if MANIFEST.exists():
        try:
            data = json.loads(MANIFEST.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                data = []
        except Exception:
            data = []
    data.append(entry)
    MANIFEST.write_text(json.dumps(data, indent=2), encoding="utf-8")

def read_manifest():
    if MANIFEST.exists():
        try:
            return json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []
