#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
elif [[ -x "$ROOT_DIR/venv/bin/python" ]]; then
  PYTHON_BIN="$ROOT_DIR/venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
else
  echo "❌ Python 3 was not found. Install Python 3.10+ and try again."
  exit 1
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "❌ GEMINI_API_KEY is missing. Add it to $ROOT_DIR/.env before running dev."
  exit 1
fi

"$PYTHON_BIN" - <<'PY'
import importlib.util
import sys

required_modules = ("fastapi", "uvicorn", "dotenv", "google.genai", "multipart")
missing = [module for module in required_modules if importlib.util.find_spec(module) is None]

if missing:
    print("❌ Missing Python dependencies:", ", ".join(missing))
    print("Install them with: python -m pip install -r requirements.txt")
    sys.exit(1)
PY

exec "$PYTHON_BIN" -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
