from fastapi import FastAPI
from routers import predict

app = FastAPI()

# Include the predict router
app.include_router(predict.router, prefix="/predict", tags=["predict"])

@app.get("/")
def root():
    return {"msg": "fastapi backend is working!"}
