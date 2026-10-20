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


def resolve_model_dir() -> Path | None:
    raw = os.getenv('SIGNBRIDGE_MODEL_DIR')
    if not raw:
        if os.getenv('SIGNBRIDGE_MODEL_SOURCE') == 'huggingface' or os.getenv('HF_MODEL_REPO_ID'):
            return Path('/tmp/signbridge/models/isl500-v2-remediated')
        return None
    path = Path(raw)
    if path.is_dir():
        return path
    repo_root = Path(__file__).resolve().parent.parent.parent
    candidate = repo_root / raw
    if candidate.is_dir():
        return candidate
    return path


def create_app(*, registry: ModelRegistry | None = None, token: str | None = None, origins: set[str] | None = None) -> FastAPI:
    model_dir = resolve_model_dir()
    selected = registry or ModelRegistry(model_dir)

    @asynccontextmanager
    async def lifespan(application):
        application.state.registry = selected
        application.state.inference = InferenceService(selected)
        application.state.inference_token = token or local_token()
        application.state.inference_origins = origins if origins is not None else permitted_origins()
        application.state.inference_connections = 0

        if registry is not None:
            loading = asyncio.create_task(asyncio.to_thread(selected.load))
        elif settings.model_source == "huggingface" and settings.auto_load_model:
            from .inference.model_provisioning import provision_and_load
            loading = asyncio.create_task(asyncio.to_thread(provision_and_load, selected))
        else:
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
        docs_url=None,
        redoc_url=None,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "Origin"],
    )
    application.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=list(settings.trusted_hosts),
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
