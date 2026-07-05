#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose not found. Install the compose plugin: https://docs.docker.com/compose/install/"
    exit 1
  fi
}

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.docker.example to .env and set OPENAI_API_KEY"
  exit 1
fi

echo "==> Step 1/3: Start all services (postgres, redis, app)"
compose up -d --build

echo "==> Step 2/3: Download + ingest data"
COMPOSE_PROFILES=tools compose run --rm ingest

echo "==> Step 3/3: Restart app (sync with fresh data)"
compose restart app

echo ""
echo "==> Done. Health check:"
echo "    curl http://localhost:4000/health"
