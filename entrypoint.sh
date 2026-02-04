#!/bin/sh
# Railway entrypoint wrapper
# Ensures PORT is properly set before starting uvicorn

# Default port if not set
if [ -z "$PORT" ]; then
    export PORT=8000
    echo "PORT not set, defaulting to 8000"
fi

# Log startup info
echo "=== VoiceSpark Starting ==="
echo "PORT: $PORT"
echo "DEPLOY_ENVIRONMENT: ${DEPLOY_ENVIRONMENT:-unknown}"

# Validate PORT is numeric
case "$PORT" in
    ''|*[!0-9]*)
        echo "ERROR: PORT '$PORT' is not numeric, using 8000"
        export PORT=8000
        ;;
esac

echo "Starting uvicorn on 0.0.0.0:$PORT"
echo "=========================="

# Start uvicorn - note the direct use of $PORT without quotes
exec uvicorn server2:app --host 0.0.0.0 --port $PORT --log-level info --access-log
