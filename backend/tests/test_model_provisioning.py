import concurrent.futures
import json
from pathlib import Path
import shutil
import tempfile
import time
from unittest.mock import MagicMock

import pytest

from app.config import Settings
from app.inference.contracts import ModelState
from app.inference.registry import ModelRegistry
from app.inference.model_provisioning import (
    EXPECTED_CHECKPOINT_SHA256,
    EXPECTED_FEATURE_SCHEMA,
    EXPECTED_MODEL_ID,
    AuthenticationError,
    ChecksumMismatchError,
    MissingModelFileError,
    ProvisioningError,
    RepositoryNotFoundError,
    SchemaMismatchError,
    download_and_verify_model,
    is_model_directory_valid,
    provision_and_load,
    redact_token,
    verify_package_integrity,
)

GENUINE_PACKAGE = Path(__file__).parents[2] / "ml/runs/isl500-v2-remediated"
TEST_REPO_ID = "test-org/signbridge-isl500-remediated"
TEST_REVISION = "0123456789abcdef0123456789abcdef01234567"
TEST_TOKEN = "hf_0123456789abcdef0123456789abcdef"


def mock_successful_download(target_dir: Path):
    """Factory creating a mock snapshot_download that copies the genuine package."""
    def _download(*args, **kwargs):
        local_dir = Path(kwargs.get("local_dir") or args[3])
        local_dir.mkdir(parents=True, exist_ok=True)
        for item in GENUINE_PACKAGE.iterdir():
            if item.is_file():
                shutil.copy2(item, local_dir / item.name)
        return str(local_dir)
    return _download


# -----------------------------------------------------------------------------
# 1. Package Integrity & Verification Tests
# -----------------------------------------------------------------------------

def test_genuine_local_package_integrity():
    """Verify that the genuine local ISL500 v2 remediated package passes all checks."""
    assert GENUINE_PACKAGE.is_dir()
    metadata = verify_package_integrity(GENUINE_PACKAGE)
    assert metadata.model_id == EXPECTED_MODEL_ID
    assert metadata.feature_schema == EXPECTED_FEATURE_SCHEMA
    assert metadata.checkpoint_sha256 == EXPECTED_CHECKPOINT_SHA256
    assert metadata.shape == (32, 172)
    assert is_model_directory_valid(GENUINE_PACKAGE) is True


def test_missing_model_files(tmp_path: Path):
    """Verify detection when required package files are missing."""
    for item in GENUINE_PACKAGE.iterdir():
        if item.is_file() and item.name != "evaluation.json":
            shutil.copy2(item, tmp_path / item.name)

    with pytest.raises(MissingModelFileError) as exc:
        verify_package_integrity(tmp_path)
    assert "evaluation.json" in str(exc.value)
    assert is_model_directory_valid(tmp_path) is False


def test_corrupt_checkpoint_checksum(tmp_path: Path):
    """Verify detection when weights.safetensors is corrupted."""
    for item in GENUINE_PACKAGE.iterdir():
        if item.is_file():
            shutil.copy2(item, tmp_path / item.name)

    weights_file = tmp_path / "weights.safetensors"
    data = bytearray(weights_file.read_bytes())
    data[100] ^= 0xFF
    weights_file.write_bytes(data)

    with pytest.raises(ChecksumMismatchError) as exc:
        verify_package_integrity(tmp_path)
    assert "Checkpoint SHA-256 mismatch" in str(exc.value) or "Manifest SHA-256 mismatch" in str(exc.value)
    assert is_model_directory_valid(tmp_path) is False


def test_manifest_checksum_mismatch(tmp_path: Path):
    """Verify detection when manifest checksum does not match file contents."""
    for item in GENUINE_PACKAGE.iterdir():
        if item.is_file():
            shutil.copy2(item, tmp_path / item.name)

    manifest_file = tmp_path / "CHECKSUMS.sha256"
    lines = manifest_file.read_text(encoding="utf-8").splitlines()
    corrupt_lines = []
    for line in lines:
        if "metadata.json" in line:
            corrupt_lines.append("0" * 64 + "  metadata.json")
        else:
            corrupt_lines.append(line)
    manifest_file.write_text("\n".join(corrupt_lines) + "\n", encoding="utf-8")

    with pytest.raises(ChecksumMismatchError) as exc:
        verify_package_integrity(tmp_path)
    assert "Manifest SHA-256 mismatch for 'metadata.json'" in str(exc.value)


def test_unsupported_model_schema(tmp_path: Path):
    """Verify rejection when feature schema is not v2."""
    for item in GENUINE_PACKAGE.iterdir():
        if item.is_file():
            shutil.copy2(item, tmp_path / item.name)

    meta_file = tmp_path / "metadata.json"
    meta_dict = json.loads(meta_file.read_text(encoding="utf-8"))
    meta_dict["feature_schema"] = "signbridge.custom-gru.v1"
    meta_dict["shape"] = [32, 161]
    meta_file.write_text(json.dumps(meta_dict), encoding="utf-8")

    with pytest.raises((SchemaMismatchError, ChecksumMismatchError)):
        verify_package_integrity(tmp_path)


# -----------------------------------------------------------------------------
# 2. Secret Redaction Tests
# -----------------------------------------------------------------------------

def test_secret_redaction():
    """Verify that secret tokens are redacted from messages and exception text."""
    secret = "hf_0123456789abcdef0123456789abcdef0123"
    text = f"Failed to authenticate with token {secret} at https://huggingface.co"
    redacted = redact_token(text, secret)
    assert secret not in redacted
    assert "hf_***[REDACTED]" in redacted


# -----------------------------------------------------------------------------
# 3. Download & Error Handling Tests
# -----------------------------------------------------------------------------

def test_download_missing_repo_id(tmp_path: Path):
    """Verify error when HF_MODEL_REPO_ID is empty or malformed."""
    with pytest.raises(ProvisioningError) as exc:
        download_and_verify_model(
            repo_id="",
            revision=TEST_REVISION,
            token=TEST_TOKEN,
            target_dir=tmp_path / "model",
        )
    assert "HF_MODEL_REPO_ID" in str(exc.value)

    with pytest.raises(ProvisioningError) as exc2:
        download_and_verify_model(
            repo_id="invalid-repo-without-slash",
            revision=TEST_REVISION,
            token=TEST_TOKEN,
            target_dir=tmp_path / "model",
        )
    assert "Expected '<namespace>/<repo-name>'" in str(exc2.value)


def test_download_missing_revision(tmp_path: Path):
    """Verify error when revision is omitted."""
    with pytest.raises(ProvisioningError) as exc:
        download_and_verify_model(
            repo_id=TEST_REPO_ID,
            revision="",
            token=TEST_TOKEN,
            target_dir=tmp_path / "model",
        )
    assert "HF_MODEL_REVISION" in str(exc.value)


def test_download_authentication_failure(tmp_path: Path):
    """Verify handling when Hugging Face returns 401 or 403."""
    mock_dl = MagicMock(side_effect=Exception("401 Client Error: Unauthorized for url"))
    with pytest.raises(AuthenticationError) as exc:
        download_and_verify_model(
            repo_id=TEST_REPO_ID,
            revision=TEST_REVISION,
            token=TEST_TOKEN,
            target_dir=tmp_path / "model",
            downloader=mock_dl,
            max_retries=0,
        )
    assert "Authentication failed" in str(exc.value)
    assert TEST_TOKEN not in str(exc.value)


def test_download_repository_not_found_404(tmp_path: Path):
    """Verify handling when Hugging Face returns 404 Repository Not Found."""
    mock_dl = MagicMock(side_effect=Exception("404 Client Error: Repository Not Found"))
    with pytest.raises(RepositoryNotFoundError) as exc:
        download_and_verify_model(
            repo_id=TEST_REPO_ID,
            revision=TEST_REVISION,
            token=TEST_TOKEN,
            target_dir=tmp_path / "model",
            downloader=mock_dl,
            max_retries=0,
        )
    assert "Repository or revision not found" in str(exc.value)


def test_download_retry_exhaustion(tmp_path: Path):
    """Verify retry exhaustion on intermittent network failures."""
    mock_dl = MagicMock(side_effect=ConnectionResetError("Connection dropped by peer"))
    with pytest.raises(ProvisioningError) as exc:
        download_and_verify_model(
            repo_id=TEST_REPO_ID,
            revision=TEST_REVISION,
            token=TEST_TOKEN,
            target_dir=tmp_path / "model",
            downloader=mock_dl,
            max_retries=2,
        )
    assert mock_dl.call_count == 3
    assert "Model download failed" in str(exc.value)


def test_download_retry_recovery(tmp_path: Path):
    """Verify successful recovery when initial download attempts fail but subsequent attempt succeeds."""
    target = tmp_path / "model"
    attempts = 0

    def _intermittent(*args, **kwargs):
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise TimeoutError("Temporary read timeout")
        return mock_successful_download(target)(*args, **kwargs)

    result_path = download_and_verify_model(
        repo_id=TEST_REPO_ID,
        revision=TEST_REVISION,
        token=TEST_TOKEN,
        target_dir=target,
        downloader=_intermittent,
        max_retries=2,
    )
    assert result_path == target
    assert attempts == 2
    assert is_model_directory_valid(target) is True


def test_successful_download_and_idempotency(tmp_path: Path):
    """Verify download, atomic promotion, and subsequent idempotent fast-path."""
    target = tmp_path / "model"
    mock_dl = MagicMock(side_effect=mock_successful_download(target))

    # First call: performs download and atomic promotion
    res1 = download_and_verify_model(
        repo_id=TEST_REPO_ID,
        revision=TEST_REVISION,
        token=TEST_TOKEN,
        target_dir=target,
        downloader=mock_dl,
    )
    assert res1 == target
    assert mock_dl.call_count == 1
    assert is_model_directory_valid(target) is True

    # Second call: target already verified, should NOT invoke downloader
    res2 = download_and_verify_model(
        repo_id=TEST_REPO_ID,
        revision=TEST_REVISION,
        token=TEST_TOKEN,
        target_dir=target,
        downloader=mock_dl,
    )
    assert res2 == target
    assert mock_dl.call_count == 1  # Unchanged


def test_concurrent_download_calls(tmp_path: Path):
    """Verify that multiple concurrent threads safely coordinate via download lock."""
    target = tmp_path / "model"
    call_count = 0

    def _counting_dl(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        time.sleep(0.05)
        return mock_successful_download(target)(*args, **kwargs)

    def _worker():
        return download_and_verify_model(
            repo_id=TEST_REPO_ID,
            revision=TEST_REVISION,
            token=TEST_TOKEN,
            target_dir=target,
            downloader=_counting_dl,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(_worker) for _ in range(4)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]

    assert len(results) == 4
    for r in results:
        assert r == target
    assert call_count == 1  # Only one download occurred
    assert is_model_directory_valid(target) is True


# -----------------------------------------------------------------------------
# 4. ModelRegistry provision_and_load State Transition Tests
# -----------------------------------------------------------------------------

def test_provision_and_load_not_configured():
    """Verify honest NOT_INSTALLED state when HF_MODEL_REPO_ID is empty."""
    registry = ModelRegistry()
    cfg = Settings(model_source="huggingface", hf_model_repo_id="", hf_model_revision=TEST_REVISION)
    provision_and_load(registry, settings_override=cfg)
    assert registry.state == ModelState.NOT_INSTALLED
    assert "HF_MODEL_REPO_ID is empty" in registry.message


def test_provision_and_load_unpinned_revision():
    """Verify INCOMPATIBLE state when HF_MODEL_REVISION is empty."""
    registry = ModelRegistry()
    cfg = Settings(model_source="huggingface", hf_model_repo_id=TEST_REPO_ID, hf_model_revision="")
    provision_and_load(registry, settings_override=cfg)
    assert registry.state == ModelState.INCOMPATIBLE
    assert "HF_MODEL_REVISION" in registry.message


def test_provision_and_load_auth_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Verify UNAVAILABLE state on authentication error."""
    monkeypatch.setenv("SIGNBRIDGE_MODEL_DIR", str(tmp_path / "model"))
    registry = ModelRegistry()
    cfg = Settings(model_source="huggingface", hf_model_repo_id=TEST_REPO_ID, hf_model_revision=TEST_REVISION, hf_token=TEST_TOKEN)
    mock_dl = MagicMock(side_effect=Exception("401 Unauthorized"))

    provision_and_load(registry, settings_override=cfg, downloader=mock_dl)
    assert registry.state == ModelState.UNAVAILABLE
    assert "Hugging Face authentication failed" in registry.message
    assert TEST_TOKEN not in registry.message


def test_provision_and_load_repo_not_found(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Verify UNAVAILABLE state on 404."""
    monkeypatch.setenv("SIGNBRIDGE_MODEL_DIR", str(tmp_path / "model"))
    registry = ModelRegistry()
    cfg = Settings(model_source="huggingface", hf_model_repo_id=TEST_REPO_ID, hf_model_revision=TEST_REVISION)
    mock_dl = MagicMock(side_effect=Exception("404 Repository Not Found"))

    provision_and_load(registry, settings_override=cfg, downloader=mock_dl)
    assert registry.state == ModelState.UNAVAILABLE
    assert "not found" in registry.message


def test_provision_and_load_success_model_ready(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Verify successful end-to-end transition to MODEL_READY with active adapter."""
    model_dir = tmp_path / "model"
    monkeypatch.setenv("SIGNBRIDGE_MODEL_DIR", str(model_dir))
    registry = ModelRegistry()
    cfg = Settings(model_source="huggingface", hf_model_repo_id=TEST_REPO_ID, hf_model_revision=TEST_REVISION, hf_token=TEST_TOKEN)

    mock_dl = mock_successful_download(model_dir)
    provision_and_load(registry, settings_override=cfg, downloader=mock_dl)

    assert registry.state == ModelState.READY
    assert registry.adapter is not None
    info = registry.info()
    assert info["available"] is True
    assert info["model_id"] == EXPECTED_MODEL_ID
    assert info["feature_schema"] == EXPECTED_FEATURE_SCHEMA
    assert "NO_SIGN" in info["labels"]


def test_fastapi_lifespan_hf_provisioning_ready(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Verify that FastAPI lifespan with SIGNBRIDGE_MODEL_SOURCE=huggingface transitions to MODEL_READY."""
    from fastapi.testclient import TestClient
    from app.main import create_app

    model_dir = tmp_path / "model"
    monkeypatch.setenv("SIGNBRIDGE_MODEL_DIR", str(model_dir))
    monkeypatch.setenv("SIGNBRIDGE_MODEL_SOURCE", "huggingface")
    monkeypatch.setenv("HF_MODEL_REPO_ID", TEST_REPO_ID)
    monkeypatch.setenv("HF_MODEL_REVISION", TEST_REVISION)
    monkeypatch.setenv("HF_TOKEN", TEST_TOKEN)

    # Pre-populate model_dir so provision_and_load succeeds via fast-path
    model_dir.mkdir(parents=True, exist_ok=True)
    for item in GENUINE_PACKAGE.iterdir():
        if item.is_file():
            shutil.copy2(item, model_dir / item.name)

    app = create_app()
    with TestClient(app, base_url="https://signbridge-web.onrender.com") as client:
        # Check health endpoint
        state = None
        data = {}
        for _ in range(120):
            resp = client.get("/health")
            assert resp.status_code == 200
            data = resp.json()
            state = data["model_state"]
            if state != "MODEL_LOADING":
                break
            time.sleep(0.05)

        assert state == "MODEL_READY", f"Expected MODEL_READY but got {state}: {data}"
        assert data["model_status"] == "loaded"

        info_resp = client.get("/model/info")
        assert info_resp.status_code == 200
        info = info_resp.json()
        assert info["available"] is True
        assert info["model_id"] == EXPECTED_MODEL_ID
        assert info["feature_schema"] == EXPECTED_FEATURE_SCHEMA

