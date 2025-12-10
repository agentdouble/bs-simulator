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

free_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Port $port occupé par PID(s): $pids — arrêt"
    kill $pids 2>/dev/null || true
    sleep 1
    # Forcer si nécessaire
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

require_cmd uv
require_cmd npm

echo "Installation des dépendances backend (uv sync --frozen)"
(cd "$BACKEND_DIR" && uv sync --frozen)

echo "Installation des dépendances frontend (npm install)"
(cd "$FRONTEND_DIR" && npm install)

BACK_PID=""
FRONT_PID=""
if [ -f "$BACKEND_DIR/.env" ]; then
  echo "Chargement des variables depuis backend/.env"
  set -a
  # shellcheck source=/dev/null
  source "$BACKEND_DIR/.env"
  set +a
fi

cleanup() {
  echo "Arrêt des services..."
  [[ -n "$BACK_PID" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "$FRONT_PID" ]] && kill "$FRONT_PID" 2>/dev/null || true
}

stop_script() {
  trap - EXIT
  cleanup
  exit 0
}

trap cleanup EXIT
trap stop_script INT TERM

free_port 8055
free_port 8056

echo "Lancement backend (FastAPI) sur http://localhost:8055"
cd "$BACKEND_DIR"
uv run uvicorn backend.app:app --reload --host 0.0.0.0 --port 8055 &
BACK_PID=$!

echo "Lancement frontend web (Expo). API: ${EXPO_PUBLIC_API_URL:-http://localhost:8055}"
cd "$FRONTEND_DIR"
npm run web &
FRONT_PID=$!

echo "Front web attendu sur http://localhost:8056"

wait "$BACK_PID" "$FRONT_PID"
