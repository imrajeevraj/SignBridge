from abc import ABC, abstractmethod
import hashlib
import json
from pathlib import Path

from pydantic import ValidationError
from .contracts import InferenceError, ModelMetadata, ModelState


class ModelAdapter(ABC):
    metadata: ModelMetadata

    @abstractmethod
    def predict(self, features: list[float]) -> tuple[str, float]: ...

    @abstractmethod
    def close(self) -> None: ...


class CustomGRUAdapter(ModelAdapter):
    def __init__(self, directory: Path, metadata: ModelMetadata):
        import torch
        from safetensors.torch import load_file
        from safetensors import safe_open
        from .gru import SignGRU
        self.metadata = metadata
        torch.set_num_threads(2)
        path = directory / 'weights.safetensors'
        with safe_open(path, framework='pt', device='cpu') as handle:
            embedded = handle.metadata() or {}
        if embedded.get('labels_sha256') != metadata.labels_sha256 or embedded.get('feature_schema') != metadata.feature_schema:
            raise ValueError('Checkpoint embedded schema/label order does not match metadata.')
        self.model = SignGRU(len(metadata.labels), metadata.config, metadata.shape[1])
        self.model.load_state_dict(load_file(path, device='cpu'), strict=True)
        self.model.eval()
        if not all(torch.isfinite(value).all() for value in self.model.state_dict().values()):
            raise ValueError('Non-finite weights.')
        with torch.inference_mode():
            result = self.model(torch.zeros(1, *metadata.shape))
        if result.shape != (1, len(metadata.labels)) or not torch.isfinite(result).all():
            raise ValueError('Invalid output dimensions or non-finite logits.')

    def predict(self, features):
        import torch
        with torch.inference_mode():
            tensor = torch.tensor(features, dtype=torch.float32).reshape(1, *self.metadata.shape)
            probabilities = (self.model(tensor) / self.metadata.temperature).softmax(-1)[0]
            if not torch.isfinite(probabilities).all():
                raise InferenceError('MODEL_ERROR', 'Model returned non-finite probabilities.')
            index = int(probabilities.argmax())
            return self.metadata.labels[index], float(probabilities[index])

    def close(self):
        self.model = None


class ModelRegistry:
    def __init__(self, directory: Path | None = None, *, allow_test_fixture=False):
        self.directory = directory
        self.allow_test_fixture = allow_test_fixture  # Python tests only; no env/API override.
        self.state = ModelState.NOT_INSTALLED
        self.message = 'No compatible trained sign model is installed.'
        self.adapter: ModelAdapter | None = None

    def load(self):
        self.close()
        if self.directory is None or not (self.directory / 'metadata.json').is_file():
            self.state = ModelState.NOT_INSTALLED
            self.message = 'No compatible trained sign model is installed.'
            return
        self.state = ModelState.LOADING
        try:
            raw = (self.directory / 'metadata.json').read_bytes()
            if len(raw) > 131072:
                raise ValueError('Metadata too large.')
            metadata = ModelMetadata.model_validate_json(raw)
            if metadata.purpose != 'trained' and not self.allow_test_fixture:
                raise ValueError('Test fixture checkpoints cannot be enabled in the application.')
            for name, expected in [('weights.safetensors', metadata.checkpoint_sha256), ('evaluation.json', metadata.evaluation_sha256)]:
                path = self.directory / name
                if path.stat().st_size > 64 * 1024 * 1024:
                    raise ValueError('Model artifact exceeds size limit.')
                with path.open('rb') as file:
                    if hashlib.file_digest(file, 'sha256').hexdigest() != expected:
                        raise ValueError('Model artifact hash mismatch.')
            evaluation = json.loads((self.directory / 'evaluation.json').read_text())
            if evaluation.get('dataset_sha256') != metadata.dataset_sha256 or evaluation.get('labels_sha256') != metadata.labels_sha256:
                raise ValueError('Evaluation provenance does not match model.')
            if metadata.purpose == 'trained' and (not evaluation.get('signer_independent') or evaluation.get('test_samples', 0) < 1):
                raise ValueError('Held-out signer evaluation is required.')
            self.adapter = CustomGRUAdapter(self.directory, metadata)
            self.state = ModelState.READY
            self.message = 'Validated local checkpoint loaded.'
        except FileNotFoundError:
            self.state = ModelState.NOT_INSTALLED
            self.message = 'Model package is incomplete.'
        except ImportError:
            self.state = ModelState.UNAVAILABLE
            self.message = 'Install the pinned ML dependencies before loading this model.'
        except (ValueError, ValidationError, RuntimeError):
            self.state = ModelState.INCOMPATIBLE
            self.message = 'Checkpoint, schema, labels or evaluation metadata is incompatible.'
        except Exception:
            self.state = ModelState.ERROR
            self.message = 'Could not load the local model package.'

    def info(self):
        metadata = self.adapter.metadata if self.adapter and self.state == ModelState.READY else None
        return {'model_status': 'loaded' if metadata else 'not_loaded', 'state': self.state,
            'available': metadata is not None, 'model_name': metadata.model_id if metadata else None,
            'model_id': metadata.model_id if metadata else None, 'model_type': metadata.architecture if metadata else None,
            'sign_language': metadata.language if metadata else None, 'model_version': metadata.model_version if metadata else None,
            'feature_schema': metadata.feature_schema if metadata else None, 'sequence_shape': list(metadata.shape) if metadata else None,
            'sampling_hz': metadata.sampling_hz if metadata else None,
            'supported_sign_languages': [metadata.language] if metadata else [], 'labels': metadata.labels if metadata else [],
            'vocabulary_size': len(metadata.labels) if metadata else 0,
            'checkpoint_sha256': metadata.checkpoint_sha256 if metadata else None,
            'confidence_threshold': metadata.confidence_threshold if metadata else None,
            'calibrated': metadata.calibrated if metadata else False, 'message': self.message}

    def close(self):
        self.adapter and self.adapter.close()
        self.adapter = None
        self.state = ModelState.NOT_INSTALLED
