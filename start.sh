#!/usr/bin/env bash
# One command to run ReadAlong: sets up Python + Node deps on first run,
# builds the web app, and serves everything at http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env. Add your ASSEMBLYAI_API_KEY there, then run ./start.sh again."
  exit 1
fi

if [ ! -d backend/venv ]; then
  python3 -m venv backend/venv
  backend/venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install --silent)
fi
(cd frontend && npx vite build --logLevel warn)

echo "ReadAlong running at http://localhost:8000"
cd backend && exec venv/bin/uvicorn main:app --port "${PORT:-8000}"
