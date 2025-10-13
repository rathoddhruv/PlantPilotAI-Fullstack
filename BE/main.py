from fastapi import FastAPI
from routers.pipeline import router as pipeline_router
from routers.uploads import router as uploads_router

app = FastAPI()

app.include_router(uploads_router, prefix="/upload", tags=["upload"])
app.include_router(pipeline_router, prefix="/pipeline", tags=["pipeline"])

@app.get("/")
def root():
    return {"msg": "fastapi backend is working"}
