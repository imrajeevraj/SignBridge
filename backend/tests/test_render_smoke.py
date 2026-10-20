import time

import pytest
from starlette.websockets import WebSocketDisconnect
from fastapi.testclient import TestClient

from app.main import create_app
from app.inference.contracts import PROTOCOL


TOKEN = "RENDER_TEST_TOKEN_" + "y" * 32
RENDER_ORIGIN = "https://signbridge-2mpr.onrender.com"


def test_render_health_endpoint() -> None:
    app = create_app()
    with TestClient(app, base_url="https://signbridge-2mpr.onrender.com") as client:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "model_state" in data


def test_cors_preflight_onrender() -> None:
    app = create_app()
    with TestClient(app, base_url="https://signbridge-2mpr.onrender.com") as client:
        headers = {
            "Origin": RENDER_ORIGIN,
            "Access-Control-Request-Method": "GET",
        }
        response = client.options("/health", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == RENDER_ORIGIN


def test_websocket_origin_render_allowed() -> None:
    app = create_app(token=TOKEN, origins={RENDER_ORIGIN})
    with TestClient(app, base_url="https://signbridge-2mpr.onrender.com") as client:
        with client.websocket_connect(
            "/ws/infer",
            headers={"origin": RENDER_ORIGIN},
        ) as websocket:
            websocket.send_json({
                "type": "authenticate",
                "protocol": PROTOCOL,
                "token": TOKEN,
            })
            reply = websocket.receive_json()
            assert reply["type"] == "authenticated"
            assert reply["protocol"] == PROTOCOL


def test_websocket_origin_disallowed() -> None:
    app = create_app(token=TOKEN, origins={RENDER_ORIGIN})
    with TestClient(app, base_url="https://signbridge-2mpr.onrender.com") as client:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(
                "/ws/infer",
                headers={"Origin": "https://malicious-site.example.org"},
            ) as websocket:
                websocket.receive_json()
        assert exc_info.value.code == 1008


def test_trained_model_loading_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIGNBRIDGE_MODEL_DIR", "ml/runs/isl500-v2-remediated")
    app = create_app()
    with TestClient(app, base_url="https://signbridge-2mpr.onrender.com") as client:
        # Verify honest transition from MODEL_LOADING to MODEL_READY
        state = None
        data = {}
        for _ in range(150):
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            state = data["model_state"]
            if state != "MODEL_LOADING":
                break
            time.sleep(0.1)

        assert state == "MODEL_READY", f"Expected MODEL_READY but got {state}: {data}"
        assert data["model_status"] == "loaded"

        info_resp = client.get("/model/info")
        assert info_resp.status_code == 200
        info = info_resp.json()
        assert info["available"] is True
        assert info["model_id"] == "signbridge-custom-gru"
        assert info["feature_schema"] == "signbridge.custom-gru.v2"
        assert "NO_SIGN" in info["labels"]

