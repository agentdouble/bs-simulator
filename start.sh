#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Commande requise manquante: $1" >&2
    exit 1
  fi
}

require_cmd uv
require_cmd npm

BACK_PID=""
FRONT_PID=""

cleanup() {
  echo "Arrêt des services..."
  [[ -n "$BACK_PID" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "$FRONT_PID" ]] && kill "$FRONT_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Lancement backend (FastAPI) sur http://localhost:8000"
cd "$BACKEND_DIR"
uv run uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000 &
BACK_PID=$!

echo "Lancement frontend (Expo). API: ${EXPO_PUBLIC_API_URL:-http://localhost:8000}"
cd "$FRONTEND_DIR"
npm start &
FRONT_PID=$!

wait "$BACK_PID" "$FRONT_PID"
