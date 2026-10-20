from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import HealthResponse, ModelInfoResponse


@pytest.fixture
def client() -> Iterator[TestClient]:
    # Enter lifespan: this also verifies startup/shutdown without ML dependencies.
    with TestClient(create_app(), base_url="http://127.0.0.1") as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok", "service": "SignBridge AI Backend",
        "phase": 3, "model_status": "not_loaded", "model_state": "MODEL_NOT_INSTALLED",
    }
    HealthResponse.model_validate(response.json())


def test_model_is_unavailable(client: TestClient) -> None:
    response = client.get("/model/info")
    assert response.status_code == 200
    info = ModelInfoResponse.model_validate(response.json())
    assert info.available is False
    assert info.model_name is None
    assert info.sign_language is None
    assert info.supported_sign_languages == []
    assert info.vocabulary_size == 0


def test_no_prediction_route(client: TestClient) -> None:
    assert client.post("/predict", json={}).status_code == 404


def test_preview_origin_is_allowed(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "http://127.0.0.1:5173"})
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "access-control-allow-credentials" not in response.headers


def test_unknown_origin_is_not_granted_cors(client: TestClient) -> None:
    response = client.options("/health", headers={
        "Origin": "https://example.com", "Access-Control-Request-Method": "GET",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_untrusted_host_is_rejected(client: TestClient) -> None:
    assert client.get("/health", headers={"Host": "evil.example"}).status_code == 400


def test_health_is_read_only(client: TestClient) -> None:
    assert client.post("/health").status_code == 405


def test_openapi_and_no_remote_docs(client: TestClient) -> None:
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/docs").status_code == 404
