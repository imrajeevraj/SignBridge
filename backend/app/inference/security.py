import os
from pathlib import Path
import re
import secrets

TOKEN_PATH = Path(__file__).resolve().parents[2] / '.local' / 'inference-token'


def permitted_origins() -> set[str]:
    origins = {'http://127.0.0.1:5173'}
    for origin in os.getenv('SIGNBRIDGE_EXTENSION_ORIGINS', '').split(','):
        origin = origin.strip()
        if not origin:
            continue
        if not re.fullmatch(r'chrome-extension://[a-p]{32}', origin):
            raise ValueError('SIGNBRIDGE_EXTENSION_ORIGINS requires exact Chrome extension origins.')
        origins.add(origin)
    return origins


def local_token() -> str:
    supplied = os.getenv('SIGNBRIDGE_TOKEN')
    if supplied is not None:
        if not 32 <= len(supplied) <= 128:
            raise ValueError('SIGNBRIDGE_TOKEN must contain 32–128 characters.')
        return supplied
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(TOKEN_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        value = TOKEN_PATH.read_text(encoding='utf-8').strip()
    else:
        value = secrets.token_urlsafe(32)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            handle.write(value)
    if not 32 <= len(value) <= 128:
        raise ValueError('Invalid backend/.local/inference-token. Replace it with a new private token.')
    return value
