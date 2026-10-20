import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import settings
from .schemas import HealthResponse, ModelInfoResponse
from .inference.registry import ModelRegistry
from .inference.service import InferenceService
from .inference.security import local_token, permitted_origins
from .inference.websocket import inference_socket


def create_app(*, registry: ModelRegistry | None = None, token: str | None = None, origins: set[str] | None = None) -> FastAPI:
    selected = registry or ModelRegistry(Path(os.environ['SIGNBRIDGE_MODEL_DIR']) if os.getenv('SIGNBRIDGE_MODEL_DIR') else None)

    @asynccontextmanager
    async def lifespan(application):
        application.state.registry = selected
        application.state.inference = InferenceService(selected)
        application.state.inference_token = token or local_token()
        application.state.inference_origins = origins if origins is not None else permitted_origins()
        application.state.inference_connections = 0
        loading = asyncio.create_task(asyncio.to_thread(selected.load))
        try:
            yield
        finally:
            await loading
            await application.state.inference.close()

    application = FastAPI(
        title=settings.service_name,
        version="0.3.0",
        description="Local opt-in sign inference. No recording or meeting capture.",
        lifespan=lifespan,
        # FastAPI's default documentation pages load CDN scripts; leave them off.
        docs_url=None,
        redoc_url=None,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
    )
    application.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"]
    )

    @application.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(model_status=selected.info()['model_status'], model_state=selected.state)

    @application.get("/model/info", response_model=ModelInfoResponse)
    async def model_info() -> ModelInfoResponse:
        return ModelInfoResponse(**selected.info())

    @application.websocket('/ws/infer')
    async def infer(socket: WebSocket):
        await inference_socket(socket)

    return application


app = create_app()
