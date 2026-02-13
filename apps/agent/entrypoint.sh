#!/bin/sh

echo "Run app with uvicorn server..."
uvicorn app:app --port 8001 --host 0.0.0.0 --workers 1