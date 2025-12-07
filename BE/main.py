from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from BE.settings import UPLOAD_DIR
from BE.routers import project, inference
# retaining old routers for reference or backward compat if needed
from BE.routers.pipeline import router as pipeline_router
from BE.routers.uploads import router as uploads_router

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

app.mount("/static", StaticFiles(directory="static"), name="static")
# Mount uploads as well so we can serve images
app.mount("/static/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(project.router, prefix="/api/v1/project", tags=["project"])
app.include_router(inference.router, prefix="/api/v1/inference", tags=["inference"])
app.include_router(uploads_router, prefix="/upload", tags=["upload_legacy"])
app.include_router(pipeline_router, prefix="/pipeline", tags=["pipeline_legacy"])

@app.get("/")
def root():
    return {"msg": "PlantPilotAI Backend Running"}
