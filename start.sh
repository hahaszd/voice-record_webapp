#!/bin/bash

# Railway startup script
# This ensures the PORT environment variable is properly used

# Get the port from environment or default to 8000
PORT=${PORT:-8000}

echo "🚀 Starting VoiceSpark on port $PORT"
echo "📝 Environment: ${DEPLOY_ENVIRONMENT:-unknown}"
echo "🐍 Python version: $(python --version)"

# Check if credentials exist
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS_JSON" ]; then
    echo "✅ Google Cloud credentials found in environment"
else
    echo "⚠️  Warning: GOOGLE_APPLICATION_CREDENTIALS_JSON not set"
fi

# Start uvicorn with proper logging
exec uvicorn server2:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --log-level info \
    --access-log \
    --use-colors
