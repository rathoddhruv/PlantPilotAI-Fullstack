from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from BE.settings import UPLOAD_DIR
from BE.routers import project, inference
# retaining old routers for reference or backward compat if needed
from BE.routers.pipeline import router as pipeline_router
from BE.routers.uploads import router as uploads_router

import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure upload dir exists for static mounting
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount uploads directly at /uploads to avoid conflict with /static
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Mount static files if directory exists, otherwise ignore or warn
# (Removed broken /static mount since directory "static" did not exist in ls output)

app.include_router(project.router, prefix="/api/v1/project", tags=["project"])
app.include_router(inference.router, prefix="/api/v1/inference", tags=["inference"])
app.include_router(uploads_router, prefix="/upload", tags=["upload_legacy"])
app.include_router(pipeline_router, prefix="/pipeline", tags=["pipeline_legacy"])

@app.get("/")
def root():
    return {"msg": "PlantPilotAI Backend Running"}
