#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> Stopping app container"
docker compose stop app

echo "==> Running ingest pipeline (download → migrate → ingest)"
docker compose run --rm --profile tools ingest

echo "==> Starting app container"
docker compose start app

echo "==> Done. API should be available on port 4000"
