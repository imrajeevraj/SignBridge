import pytest

from app.config import local_port


def test_default_port(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SIGNBRIDGE_PORT", raising=False)
    assert local_port() == 8000


def test_alternate_port(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIGNBRIDGE_PORT", "18000")
    assert local_port() == 18000


@pytest.mark.parametrize("value", ["0", "65536", "abc"])
def test_invalid_port(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("SIGNBRIDGE_PORT", value)
    with pytest.raises(ValueError):
        local_port()
