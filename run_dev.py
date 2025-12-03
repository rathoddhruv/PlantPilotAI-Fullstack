import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "BE.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["BE"],    # only watch BE folder, not the whole project
        workers=1
    )
