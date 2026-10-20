"""SignBridge AI — Hugging Face Model Provisioner.

Provides secure, authenticated, immutable-pinned downloading, SHA-256 manifest
verification, and atomic promotion of trained sign model artifacts from a
private Hugging Face repository into the local ModelRegistry.
"""

from dataclasses import dataclass
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import threading
import time
from typing import Callable
import uuid

from pydantic import ValidationError

from .contracts import ModelMetadata, ModelState
from .registry import ModelRegistry
from ..config import Settings, settings as app_settings

logger = logging.getLogger("signbridge.provisioning")

# Pinned model specifications for ISL500 v2 remediated GRU package
EXPECTED_CHECKPOINT_SHA256 = "69b2c34ce82b9f8d5171cd912c8b898d659f084f30224e3c54f1c3a4c648da7d"
EXPECTED_FEATURE_SCHEMA = "signbridge.custom-gru.v2"
EXPECTED_SHAPE = (32, 172)
EXPECTED_MODEL_ID = "signbridge-custom-gru"

REQUIRED_FILES = (
    "weights.safetensors",
    "metadata.json",
    "evaluation.json",
    "labels.json",
    "CHECKSUMS.sha256",
    "LICENSE-NOTES.md",
)

ALLOW_PATTERNS = [
    "weights.safetensors",
    "metadata.json",
    "evaluation.json",
    "labels.json",
    "CHECKSUMS.sha256",
    "LICENSE-NOTES.md",
    "open-set.json",
]

_DOWNLOAD_LOCK = threading.Lock()
_TOKEN_PATTERN = re.compile(r"hf_[A-Za-z0-9_-]{20,}")

try:
    from huggingface_hub import snapshot_download
    from huggingface_hub.utils import (
        GatedRepoError,
        HfHubHTTPError,
        RepositoryNotFoundError,
        RevisionNotFoundError,
    )
    HUGGINGFACE_HUB_AVAILABLE = True
except ImportError:
    snapshot_download = None  # type: ignore
    GatedRepoError = Exception  # type: ignore
    HfHubHTTPError = Exception  # type: ignore
    RepositoryNotFoundError = Exception  # type: ignore
    RevisionNotFoundError = Exception  # type: ignore
    HUGGINGFACE_HUB_AVAILABLE = False


class ProvisioningError(Exception):
    """Base error for model provisioning failures."""
    pass


class AuthenticationError(ProvisioningError):
    """Raised when authentication to the Hugging Face repository fails (401/403)."""
    pass


class RepositoryNotFoundError(ProvisioningError):
    """Raised when the specified Hugging Face repository or revision does not exist (404)."""
    pass


class MissingModelFileError(ProvisioningError):
    """Raised when one or more required model package files are missing."""
    pass


class ChecksumMismatchError(ProvisioningError):
    """Raised when an artifact checksum does not match expected manifest or checkpoint hash."""
    pass


class SchemaMismatchError(ProvisioningError):
    """Raised when model metadata schema, shape or configuration is incompatible."""
    pass


def redact_token(text: str, token: str | None = None) -> str:
    """Mask Hugging Face tokens and API secrets from logs and error messages."""
    if not text:
        return ""
    cleaned = _TOKEN_PATTERN.sub("hf_***[REDACTED]", text)
    if token and len(token) >= 6:
        cleaned = cleaned.replace(token, "hf_***[REDACTED]")
    return cleaned


def compute_file_sha256(path: Path) -> str:
    """Compute the SHA-256 digest of a file in bounded memory chunks."""
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_package_integrity(directory: Path) -> ModelMetadata:
    """Validate all files, manifest hashes, metadata schema, and checkpoint integrity.

    Returns the validated ModelMetadata instance upon success.
    Raises ProvisioningError subclasses if verification fails.
    """
    if not directory.is_dir():
        raise ProvisioningError(f"Model directory does not exist: {directory}")

    # 1. Verify existence of required files
    missing = [f for f in REQUIRED_FILES if not (directory / f).is_file()]
    if missing:
        raise MissingModelFileError(f"Missing required model package files: {', '.join(missing)}")

    # 2. Parse CHECKSUMS.sha256 and verify every listed file
    checksums_path = directory / "CHECKSUMS.sha256"
    checksums_text = checksums_path.read_text(encoding="utf-8")
    manifest_entries: dict[str, str] = {}
    for line in checksums_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) == 2:
            expected_hash = parts[0].strip().lower()
            filename = parts[1].strip().lstrip("*")
            manifest_entries[filename] = expected_hash

    if not manifest_entries:
        raise ChecksumMismatchError("CHECKSUMS.sha256 is empty or contains no valid entries.")

    for filename, expected_hash in manifest_entries.items():
        file_path = directory / filename
        if not file_path.is_file():
            raise MissingModelFileError(f"File listed in manifest is missing: {filename}")
        actual_hash = compute_file_sha256(file_path)
        if actual_hash != expected_hash:
            raise ChecksumMismatchError(
                f"Manifest SHA-256 mismatch for '{filename}': computed {actual_hash}, expected {expected_hash}"
            )

    # 3. Independently verify the known expected checkpoint SHA-256
    weights_path = directory / "weights.safetensors"
    if weights_path.stat().st_size > 64 * 1024 * 1024:
        raise ProvisioningError("weights.safetensors exceeds maximum permissible size limit.")
    weights_hash = compute_file_sha256(weights_path)
    if weights_hash != EXPECTED_CHECKPOINT_SHA256:
        raise ChecksumMismatchError(
            f"Checkpoint SHA-256 mismatch: computed {weights_hash}, expected {EXPECTED_CHECKPOINT_SHA256}"
        )

    # 4. Verify metadata.json schema and compatibility
    metadata_bytes = (directory / "metadata.json").read_bytes()
    if len(metadata_bytes) > 131072:
        raise SchemaMismatchError("metadata.json exceeds maximum size limit (128 KB).")
    try:
        metadata = ModelMetadata.model_validate_json(metadata_bytes)
    except ValidationError as exc:
        raise SchemaMismatchError(f"metadata.json validation failed: {exc}") from exc

    if metadata.checkpoint_sha256 != EXPECTED_CHECKPOINT_SHA256:
        raise ChecksumMismatchError(
            f"metadata.json checkpoint_sha256 mismatch: {metadata.checkpoint_sha256} != {EXPECTED_CHECKPOINT_SHA256}"
        )
    if metadata.feature_schema != EXPECTED_FEATURE_SCHEMA:
        raise SchemaMismatchError(
            f"Incompatible feature schema: '{metadata.feature_schema}', expected '{EXPECTED_FEATURE_SCHEMA}'"
        )
    if metadata.shape != EXPECTED_SHAPE:
        raise SchemaMismatchError(
            f"Incompatible input shape: {metadata.shape}, expected {EXPECTED_SHAPE}"
        )
    if metadata.model_id != EXPECTED_MODEL_ID:
        raise SchemaMismatchError(
            f"Unexpected model_id: '{metadata.model_id}', expected '{EXPECTED_MODEL_ID}'"
        )
    if metadata.purpose != "trained":
        raise SchemaMismatchError(
            f"Invalid model purpose: '{metadata.purpose}'. Only 'trained' models are permitted in production."
        )

    # 5. Verify evaluation.json provenance
    try:
        eval_data = json.loads((directory / "evaluation.json").read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SchemaMismatchError("evaluation.json is invalid JSON.") from exc

    if eval_data.get("dataset_sha256") != metadata.dataset_sha256 or eval_data.get("labels_sha256") != metadata.labels_sha256:
        raise SchemaMismatchError("evaluation.json dataset/label provenance does not match model metadata.")
    if not eval_data.get("signer_independent") or eval_data.get("test_samples", 0) < 1:
        raise SchemaMismatchError("evaluation.json lacks required held-out signer-independent validation.")

    # 6. Verify open-set.json if present
    open_set_path = directory / "open-set.json"
    if open_set_path.is_file():
        try:
            open_set_data = json.loads(open_set_path.read_text(encoding="utf-8"))
            if open_set_data.get("checkpoint_sha256") != EXPECTED_CHECKPOINT_SHA256:
                raise ChecksumMismatchError(
                    "open-set.json checkpoint_sha256 does not match expected checkpoint."
                )
        except json.JSONDecodeError as exc:
            raise SchemaMismatchError("open-set.json is invalid JSON.") from exc

    return metadata


def is_model_directory_valid(directory: Path) -> bool:
    """Return True if the directory exists and passes all integrity checks."""
    try:
        verify_package_integrity(directory)
        return True
    except Exception:
        return False


def download_and_verify_model(
    *,
    repo_id: str,
    revision: str,
    token: str | None,
    target_dir: Path,
    max_retries: int = 2,
    downloader: Callable[..., str] | None = None,
) -> Path:
    """Download the model package from Hugging Face into staging, verify integrity,

    and atomically promote to target_dir. Concurrency-safe and idempotent.
    """
    clean_repo = repo_id.strip() if repo_id else ""
    clean_rev = revision.strip() if revision else ""

    if not clean_repo:
        raise ProvisioningError("Hugging Face repository ID (HF_MODEL_REPO_ID) is required.")
    if "/" not in clean_repo or clean_repo.count("/") > 1:
        raise ProvisioningError(
            f"Invalid repository ID format: '{clean_repo}'. Expected '<namespace>/<repo-name>'."
        )
    if not clean_rev:
        raise ProvisioningError(
            "Hugging Face revision (HF_MODEL_REVISION) is required. Must be an immutable commit SHA."
        )

    with _DOWNLOAD_LOCK:
        # Idempotent fast-path: if target is already present and valid, reuse it.
        if is_model_directory_valid(target_dir):
            logger.info("Model package at %s is already valid; skipping download.", target_dir)
            return target_dir

        target_dir.parent.mkdir(parents=True, exist_ok=True)
        staging_dir = target_dir.parent / f".staging-{uuid.uuid4().hex[:8]}"

        download_fn = downloader
        if download_fn is None:
            if not HUGGINGFACE_HUB_AVAILABLE or snapshot_download is None:
                raise ProvisioningError(
                    "huggingface_hub is not installed. Install the pinned ML dependencies first."
                )
            download_fn = snapshot_download

        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                staging_dir.mkdir(parents=True, exist_ok=True)
                download_fn(
                    repo_id=clean_repo,
                    revision=clean_rev,
                    token=token,
                    allow_patterns=ALLOW_PATTERNS,
                    local_dir=staging_dir,
                )
                break
            except Exception as exc:
                last_error = exc
                shutil.rmtree(staging_dir, ignore_errors=True)

                error_str = str(exc)
                status_code = getattr(getattr(exc, "response", None), "status_code", None)

                # Differentiate authentication vs not found vs generic network errors
                if (
                    isinstance(exc, GatedRepoError)
                    or status_code in (401, 403)
                    or "401" in error_str
                    or "403" in error_str
                    or "Unauthorized" in error_str
                    or "Forbidden" in error_str
                ):
                    clean_msg = redact_token(f"Authentication failed for repository '{clean_repo}': {exc}", token)
                    raise AuthenticationError(clean_msg) from exc

                if (
                    isinstance(exc, (RepositoryNotFoundError, RevisionNotFoundError))
                    or status_code == 404
                    or "404" in error_str
                    or "Repository Not Found" in error_str
                    or "Revision Not Found" in error_str
                ):
                    clean_msg = redact_token(
                        f"Repository or revision not found: '{clean_repo}@{clean_rev}'", token
                    )
                    raise RepositoryNotFoundError(clean_msg) from exc

                if attempt < max_retries:
                    time.sleep(1.0 * (attempt + 1))
                else:
                    clean_msg = redact_token(
                        f"Model download failed after {max_retries + 1} attempts: {exc}", token
                    )
                    raise ProvisioningError(clean_msg) from exc

        # Verify integrity of downloaded files in staging
        try:
            verify_package_integrity(staging_dir)
        except Exception as exc:
            shutil.rmtree(staging_dir, ignore_errors=True)
            raise

        # Atomically promote staging directory to target_dir
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)

        try:
            staging_dir.rename(target_dir)
        except OSError:
            # Fallback for cross-device moves or Windows locks
            shutil.move(str(staging_dir), str(target_dir))

        logger.info("Successfully provisioned and verified model at %s", target_dir)
        return target_dir


def provision_and_load(
    registry: ModelRegistry,
    *,
    settings_override: Settings | None = None,
    downloader: Callable[..., str] | None = None,
) -> None:
    """Provision model from Hugging Face if configured, then load it into the registry.

    Gracefully updates registry.state and registry.message without raising unhandled exceptions.
    """
    settings = settings_override or app_settings

    if settings.model_source != "huggingface":
        registry.load()
        return

    repo_id = settings.hf_model_repo_id
    revision = settings.hf_model_revision
    token = settings.hf_token or None

    if not repo_id:
        registry.state = ModelState.NOT_INSTALLED
        registry.message = "No Hugging Face model repository configured (HF_MODEL_REPO_ID is empty)."
        return

    if not revision:
        registry.state = ModelState.INCOMPATIBLE
        registry.message = "Hugging Face model revision (HF_MODEL_REVISION) must be pinned to an immutable commit SHA."
        return

    target_raw = os.environ.get("SIGNBRIDGE_MODEL_DIR") or "/tmp/signbridge/models/isl500-v2-remediated"
    target_dir = Path(target_raw)

    registry.state = ModelState.LOADING
    short_rev = revision[:7] if len(revision) >= 7 else revision
    registry.message = f"Provisioning model package from Hugging Face ({repo_id}@{short_rev})..."

    try:
        download_and_verify_model(
            repo_id=repo_id,
            revision=revision,
            token=token,
            target_dir=target_dir,
            downloader=downloader,
        )
        registry.directory = target_dir
        registry.load()
    except AuthenticationError as exc:
        registry.state = ModelState.UNAVAILABLE
        registry.message = redact_token(f"Hugging Face authentication failed: {exc}", token)
    except RepositoryNotFoundError as exc:
        registry.state = ModelState.UNAVAILABLE
        registry.message = redact_token(f"Hugging Face repository or revision not found: {exc}", token)
    except (ChecksumMismatchError, SchemaMismatchError, MissingModelFileError) as exc:
        registry.state = ModelState.INCOMPATIBLE
        registry.message = redact_token(f"Model integrity verification failed: {exc}", token)
    except ProvisioningError as exc:
        registry.state = ModelState.ERROR
        registry.message = redact_token(f"Model provisioning failed: {exc}", token)
    except Exception as exc:
        registry.state = ModelState.ERROR
        registry.message = redact_token(f"Unexpected error during model provisioning: {exc}", token)

