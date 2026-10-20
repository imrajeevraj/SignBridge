"""Pinned Windows fallback for a Playwright Chromium side-by-side launch failure."""
from pathlib import Path
import os
import platform
import urllib.request
import zipfile

VERSION = "155.0.8059.84"
if os.name != "nt" or platform.machine().lower() not in {"amd64", "x86_64"}:
    raise SystemExit("This fallback is for Windows x64. Use: npx playwright install chromium")
root = Path(__file__).resolve().parents[1] / ".cache" / "chrome-for-testing-155"
root.mkdir(parents=True, exist_ok=True)
archive = root / "chrome-win64.zip"
url = f"https://storage.googleapis.com/chrome-for-testing-public/{VERSION}/win64/chrome-win64.zip"
if not zipfile.is_zipfile(archive):
    print(f"Downloading Chrome for Testing {VERSION} from Google...", flush=True)
    with urllib.request.urlopen(url, timeout=60) as response, archive.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
with zipfile.ZipFile(archive) as bundle:
    for item in bundle.infolist():
        if not (root / item.filename).resolve().is_relative_to(root.resolve()):
            raise RuntimeError("Archive path escapes the test browser directory.")
    bundle.extractall(root)
executable = root / "chrome-win64" / "chrome.exe"
print("Use this PowerShell environment variable before npm run test:e2e:")
print(f"$env:SIGNBRIDGE_CHROMIUM_PATH = '{executable}'")
