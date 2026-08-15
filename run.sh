#!/usr/bin/env bash
# Start the Inkwell dev server.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8000}"
exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
