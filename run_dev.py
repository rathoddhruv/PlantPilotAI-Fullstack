import subprocess
import sys
from pathlib import Path
import time
from threading import Thread
import os

ROOT = Path(__file__).resolve().parent

BE_PATH = ROOT / "BE"
FE_PATH = ROOT / "FE"
PY = ROOT / ".venv" / "Scripts" / "python.exe"
NPM = "npm.cmd"

BACKEND = [
    str(PY),
    "-m",
    "uvicorn",
    "BE.main:app",
    "--reload",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
]

FRONTEND = [NPM, "start"]

def read_output(proc, prefix):
    for line in iter(proc.stdout.readline, ""):
        if not line:
            break
        # ignore all encoding issues
        text = line.rstrip()
        print(f"[{prefix}] {text}", flush=True)
    proc.stdout.close()

def start_process(cmd, cwd, prefix):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)  # backend imports work

    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    Thread(target=read_output, args=(proc, prefix), daemon=True).start()
    return proc

def main():
    print("starting backend and frontend (dev mode)...")

    procs = {
        "backend": {"cmd": BACKEND, "cwd": BE_PATH, "proc": None},
        "frontend": {"cmd": FRONTEND, "cwd": FE_PATH, "proc": None},
    }

    for name, p in procs.items():
        p["proc"] = start_process(p["cmd"], p["cwd"], name)

    print("running... ctrl+c to exit")

    try:
        while True:
            for name, p in procs.items():
                proc = p["proc"]
                code = proc.poll()
                if code is not None:
                    print(f"[{name}] stopped with code {code}, restarting in 2s...")
                    time.sleep(2)
                    p["proc"] = start_process(p["cmd"], p["cwd"], name)
            time.sleep(1)
    except KeyboardInterrupt:
        print("shutting down processes...")
        for name, p in procs.items():
            try:
                p["proc"].terminate()
            except:
                pass
        print("done")

if __name__ == "__main__":
    main()
