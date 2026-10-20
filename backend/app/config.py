from dataclasses import dataclass
import os


def _parse_list(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(',') if item.strip())


def local_port() -> int:
    raw_port = os.environ.get("PORT") or os.environ.get("SIGNBRIDGE_PORT") or "8000"
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError("PORT or SIGNBRIDGE_PORT must be a numeric port.") from exc
    if not 1024 <= port <= 65535:
        raise ValueError("PORT or SIGNBRIDGE_PORT must be between 1024 and 65535.")
    return port


def local_host() -> str:
    if os.environ.get("SIGNBRIDGE_HOST"):
        return os.environ["SIGNBRIDGE_HOST"]
    if os.environ.get("RENDER") or os.environ.get("PORT"):
        return "0.0.0.0"
    return "127.0.0.1"


def default_allowed_origins() -> tuple[str, ...]:
    origins = {
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "https://signbridge-2mpr.onrender.com",
    }
    origins.update(_parse_list(os.environ.get("SIGNBRIDGE_ALLOWED_ORIGINS", "")))
    return tuple(sorted(origins))


def default_trusted_hosts() -> tuple[str, ...]:
    hosts = {"127.0.0.1", "localhost", "0.0.0.0", "testserver", "signbridge-2mpr.onrender.com", "*.onrender.com"}
    hosts.update(_parse_list(os.environ.get("SIGNBRIDGE_TRUSTED_HOSTS", "")))
    return tuple(sorted(hosts))


@dataclass(frozen=True)
class Settings:
    service_name: str = "SignBridge AI Backend"
    host: str = local_host()
    port: int = local_port()
    allowed_origins: tuple[str, ...] = default_allowed_origins()
    trusted_hosts: tuple[str, ...] = default_trusted_hosts()


settings = Settings()
