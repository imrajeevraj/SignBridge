"""Create a project-local venv and install the pinned backend dependencies."""
from pathlib import Path
import os
import subprocess
import sys
import venv

root = Path(__file__).resolve().parents[1]
environment = root / "backend" / ".venv"
if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11 or newer is required.")
venv.create(environment, with_pip=True)
interpreter = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
lock = root / "backend" / "requirements-lock.txt"
requirements = lock if lock.exists() else root / "backend" / "requirements.txt"
subprocess.run([str(interpreter), "-m", "pip", "install", "-r", str(requirements)], check=True)
