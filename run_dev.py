import subprocess
import sys
from pathlib import Path
import time
from threading import Thread
import os

ROOT = Path(__file__).resolve().parent

BE_PATH = ROOT / "BE"
FE_PATH = ROOT / "FE"

VENV_PATH = ROOT / ".venv" / "Scripts" / "python.exe"

BACKEND_COMMAND = [
    str(VENV_PATH),
    "-m",
    "uvicorn",
    "BE.main:app",
    "--reload",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
]

FRONTEND_COMMAND = ["C:\\Program Files\\nodejs\\npm.cmd", "start"]


def read_output(proc, prefix):
    for line in iter(proc.stdout.readline, ""):
        print(f"[{prefix}] {line.strip()}")
    if proc.stderr:
        for line in iter(proc.stderr.readline, ""):
            print(f"[{prefix} ERROR] {line.strip()}")


def start_process(cmd, cwd, prefix):
    env = os.environ.copy()
    print(f"starting {prefix} with command: {' '.join(cmd)} in directory: {cwd}")

    if prefix == "backend":
        env["PYTHONPATH"] = str(ROOT)

    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf8",
        errors="ignore",
        env=env,
    )

    Thread(target=read_output, args=(proc, prefix), daemon=True).start()
    return proc


def main():
    print(f"Root path: {ROOT}")
    print(f"Backend command: {' '.join(BACKEND_COMMAND)}")
    print(f"Frontend command: {' '.join(FRONTEND_COMMAND)}")
    print("Press ctrl+c to stop")

    processes = [
        {"cmd": BACKEND_COMMAND, "cwd": BE_PATH, "prefix": "backend", "proc": None},
        {"cmd": FRONTEND_COMMAND, "cwd": FE_PATH, "prefix": "frontend", "proc": None},
    ]

    try:
        for p in processes:
            p["proc"] = start_process(p["cmd"], p["cwd"], p["prefix"])

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("shutting down")
        for p in processes:
            proc = p["proc"]
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
