#!/bin/bash
# Local dev launcher for VoiceSpark.
# Loads .env into the environment (the app does NOT auto-load it for most vars),
# then starts uvicorn from the local venv with auto-reload.
#
# Usage: ./run_local.sh
set -euo pipefail
cd "$(dirname "$0")"

# Load .env if present (exports every KEY=VALUE line, ignoring comments/blanks)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "✅ Loaded .env"
else
  echo "⚠️  No .env found — transcription keys will be missing"
fi

# Pick the venv python if it exists, else fall back to python3
PY="./venv/bin/python"
[ -x "$PY" ] || PY="python3"

PORT="${PORT:-8000}"
echo "🚀 Starting VoiceSpark on http://localhost:${PORT}  (env: ${DEPLOY_ENVIRONMENT:-unknown})"
exec "$PY" -m uvicorn server2:app --host 0.0.0.0 --port "$PORT" --reload --log-level info
