from enum import StrEnum
import hashlib
import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictInt, field_validator, model_validator

SCHEMA = 'signbridge.custom-gru.v1'
SCHEMA_V2 = 'signbridge.custom-gru.v2'
SCHEMA_WIDTHS = {SCHEMA: 161, SCHEMA_V2: 172}
FeatureSchema = Literal['signbridge.custom-gru.v1', 'signbridge.custom-gru.v2']
PROTOCOL = 'signbridge.inference.v1'
SHAPE = (32, 161)
MAX_MESSAGE_BYTES = 262_144
Identifier = Annotated[str, Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')]
Digest = Annotated[str, Field(pattern=r'^[a-f0-9]{64}$')]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class ModelState(StrEnum):
    NOT_INSTALLED = 'MODEL_NOT_INSTALLED'
    LOADING = 'MODEL_LOADING'
    READY = 'MODEL_READY'
    ERROR = 'MODEL_ERROR'
    INCOMPATIBLE = 'MODEL_INCOMPATIBLE'
    UNAVAILABLE = 'MODEL_UNAVAILABLE'


class GRUConfig(StrictModel):
    hidden_size: Annotated[StrictInt, Field(ge=8, le=512)] = 128
    num_layers: Annotated[StrictInt, Field(ge=1, le=4)] = 2
    dropout: Annotated[FiniteFloat, Field(ge=0, lt=1)] = 0.2


def labels_hash(labels: list[str]) -> str:
    return hashlib.sha256(json.dumps(labels, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


class ModelMetadata(StrictModel):
    model_id: Identifier
    model_version: str = Field(min_length=1, max_length=80)
    architecture: Literal['custom_gru']
    language: Literal['ISL', 'ASL']
    feature_schema: FeatureSchema
    shape: tuple[Literal[32], Literal[161, 172]]
    sampling_hz: Literal[15, 30] = 15
    config: GRUConfig
    labels: list[str] = Field(min_length=2, max_length=512)
    labels_sha256: Digest
    checkpoint_sha256: Digest
    evaluation_sha256: Digest
    dataset_sha256: Digest
    source: str = Field(min_length=1, max_length=1000)
    license: str = Field(min_length=1, max_length=1000)
    purpose: Literal['trained', 'test_fixture']
    neutral_label: str | None = None
    confidence_threshold: Annotated[FiniteFloat, Field(ge=0.5, le=1)]
    temperature: Annotated[FiniteFloat, Field(gt=0, le=20)] = 1.0
    calibrated: bool

    @model_validator(mode='after')
    def validate_labels(self):
        if self.shape != (32, SCHEMA_WIDTHS[self.feature_schema]):
            raise ValueError('Schema/shape mismatch.')
        if self.sampling_hz != (30 if self.feature_schema == SCHEMA_V2 else 15):
            raise ValueError('Schema/sampling policy mismatch.')
        if len(set(self.labels)) != len(self.labels) or any(not item or len(item) > 100 for item in self.labels):
            raise ValueError('Labels must be unique, nonempty and bounded.')
        if labels_hash(self.labels) != self.labels_sha256:
            raise ValueError('Label ordering/hash mismatch.')
        if self.neutral_label is not None and self.neutral_label not in self.labels:
            raise ValueError('Neutral label is not in the vocabulary.')
        return self


class PredictRequest(StrictModel):
    type: Literal['predict']
    protocol: Literal['signbridge.inference.v1']
    request_id: Identifier
    model_id: Identifier
    schema_version: FeatureSchema
    sequence_id: Annotated[StrictInt, Field(ge=0)]
    sequence_shape: tuple[Literal[32], Literal[161, 172]]
    sampling_hz: Literal[15, 30] = 15
    captured_at_ms: Annotated[FiniteFloat, Field(ge=0)]
    sent_at_ms: Annotated[FiniteFloat, Field(ge=0)]
    features: list[FiniteFloat] = Field(min_length=5152, max_length=5504)

    @field_validator('captured_at_ms', 'sent_at_ms', mode='before')
    @classmethod
    def numeric_timestamps(cls, value):
        if type(value) not in (float, int):
            raise ValueError('Timestamp must be a JSON number.')
        return value

    @field_validator('features', mode='before')
    @classmethod
    def numbers_only(cls, values):
        if not isinstance(values, list) or any(type(value) not in (float, int) for value in values):
            raise ValueError('Features must be numeric JSON values, not coerced strings/bools.')
        return values

    @model_validator(mode='after')
    def validate_masks(self):
        width = SCHEMA_WIDTHS[self.schema_version]
        if self.sampling_hz != (30 if self.schema_version == SCHEMA_V2 else 15):
            raise ValueError('Schema/sampling policy mismatch.')
        if self.sequence_shape != (32, width) or len(self.features) != 32 * width:
            raise ValueError('Schema/shape/feature length mismatch.')
        for start in range(0, len(self.features), width):
            row = self.features[start:start + width]
            if any(abs(value) > 3.402823466e38 for value in row):
                raise ValueError('Features exceed float32 range.')
            if row[159] not in (0, 1) or row[160] not in (0, 1):
                raise ValueError('Hand masks must be binary.')
            for hand in range(2):
                if row[159 + hand] == 0 and any(row[hand * 63:hand * 63 + 63]):
                    raise ValueError('Absent hand must be zero-filled.')
            if self.schema_version == SCHEMA_V2:
                if any(mask not in (0, 1) for mask in row[161:]):
                    raise ValueError('Pose masks must be binary.')
                if row[162] != 1 or row[163] != 1:
                    raise ValueError('Both shoulder anchors must be valid.')
                for slot, mask in enumerate(row[161:]):
                    if mask == 0 and any(row[126 + slot * 3:129 + slot * 3]):
                        raise ValueError('Absent pose point must be zero-filled.')
        if self.sent_at_ms < self.captured_at_ms:
            raise ValueError('Send time precedes capture.')
        return self


class AuthRequest(StrictModel):
    type: Literal['authenticate']
    protocol: Literal['signbridge.inference.v1']
    token: str = Field(min_length=32, max_length=128)


class InferenceError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)
