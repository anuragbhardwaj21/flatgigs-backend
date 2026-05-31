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

echo "==> Stopping app container"
compose stop app

echo "==> Running ingest pipeline (download → migrate → ingest)"
# --profile must come before the subcommand on older Compose builds
COMPOSE_PROFILES=tools compose run --rm ingest

echo "==> Starting app container"
compose start app

echo "==> Done. API should be available on port 4000"
