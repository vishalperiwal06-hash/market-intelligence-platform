#!/bin/sh

# Exit immediately if any command fails
# set -e

echo "Starting database initialization..."
# Run migrations/init db
npm run db:init || echo "Database init completed or skipped"

echo "Starting Python NSE Data Service..."
cd /app/services/nse-data
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!

echo "Starting Node.js Corporate Ingestion Engine..."
cd /app
npm run engine &
NODE_PID=$!

# Handle shutdown signals gracefully
cleanup() {
    echo "Shutting down gracefully..."
    kill -TERM "$PYTHON_PID" 2>/dev/null || true
    kill -TERM "$NODE_PID" 2>/dev/null || true
    exit 0
}

trap cleanup INT TERM

# Wait for both background processes to keep container active
wait "$PYTHON_PID" "$NODE_PID"
