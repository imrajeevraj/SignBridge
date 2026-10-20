from dataclasses import dataclass
import os


def local_port() -> int:
    port = int(os.environ.get("SIGNBRIDGE_PORT", "8000"))
    if not 1024 <= port <= 65535:
        raise ValueError("SIGNBRIDGE_PORT must be between 1024 and 65535.")
    return port


@dataclass(frozen=True)
class Settings:
    service_name: str = "SignBridge AI Backend"
    host: str = "127.0.0.1"
    port: int = local_port()
    # Browser preview only. Installed extension fetches through its service worker
    # with a narrowly scoped host permission; no wildcard extension CORS is needed.
    allowed_origins: tuple[str, ...] = ("http://127.0.0.1:5173",)


settings = Settings()
