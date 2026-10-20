import uvicorn

from .config import settings

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True,
                ws_max_size=262144, ws_max_queue=1, limit_concurrency=16)
