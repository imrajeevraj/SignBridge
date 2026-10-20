import pytest

from app.config import default_allowed_origins, default_trusted_hosts, local_host, local_port


def test_default_port(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("SIGNBRIDGE_PORT", raising=False)
    assert local_port() == 8000


def test_render_port(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SIGNBRIDGE_PORT", raising=False)
    monkeypatch.setenv("PORT", "10000")
    assert local_port() == 10000


def test_alternate_port(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setenv("SIGNBRIDGE_PORT", "18000")
    assert local_port() == 18000


@pytest.mark.parametrize("value", ["0", "65536", "abc"])
def test_invalid_port(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.setenv("SIGNBRIDGE_PORT", value)
    with pytest.raises(ValueError):
        local_port()


def test_local_host_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SIGNBRIDGE_HOST", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("PORT", raising=False)
    assert local_host() == "127.0.0.1"


def test_local_host_render(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SIGNBRIDGE_HOST", raising=False)
    monkeypatch.setenv("RENDER", "true")
    assert local_host() == "0.0.0.0"


def test_allowed_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIGNBRIDGE_ALLOWED_ORIGINS", "https://custom.example.com,https://app.example.com")
    origins = default_allowed_origins()
    assert "https://custom.example.com" in origins
    assert "https://signbridge-2mpr.onrender.com" in origins


def test_trusted_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIGNBRIDGE_TRUSTED_HOSTS", "api.example.com")
    hosts = default_trusted_hosts()
    assert "api.example.com" in hosts
    assert "*.onrender.com" in hosts

