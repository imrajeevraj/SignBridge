from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from .inference.contracts import ModelState


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok"] = "ok"
    service: Literal["SignBridge AI Backend"] = "SignBridge AI Backend"
    phase: Literal[3] = 3
    model_status: Literal['not_loaded', 'loaded'] = 'not_loaded'
    model_state: ModelState = ModelState.NOT_INSTALLED


class ModelInfoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_status: Literal['not_loaded', 'loaded'] = 'not_loaded'
    state: ModelState = ModelState.NOT_INSTALLED
    available: bool = False
    model_name: str | None = None
    model_id: str | None = None
    model_type: str | None = None
    model_version: str | None = None
    sign_language: Literal['ISL', 'ASL'] | None = None
    feature_schema: str | None = None
    sequence_shape: list[int] | None = None
    sampling_hz: Literal[15, 30] | None = None
    labels: list[str] = Field(default_factory=list)
    checkpoint_sha256: str | None = None
    confidence_threshold: float | None = None
    calibrated: bool = False
    supported_sign_languages: list[str] = Field(default_factory=list)
    vocabulary_size: int = 0
    message: str = 'No compatible trained sign model is installed.'
