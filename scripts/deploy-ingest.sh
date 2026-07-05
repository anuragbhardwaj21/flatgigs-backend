#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/deploy-common.sh"

git_pull
run_prereq_checks
require_env 1

echo "==> Step 1/4: Build and start all services (postgres, redis, app)"
compose up -d --build

echo "==> Step 2/4: Wait for app (migrations run on startup)"
wait_for_health "$DEPLOY_PORT" 180

echo "==> Step 3/4: Download and ingest data (first run: 1–3 hours)"
echo "    Follow progress: docker compose logs -f ingest"
COMPOSE_PROFILES=tools compose run --rm ingest

echo "==> Step 4/4: Restart app to sync with ingested data"
compose restart app

wait_for_health "$DEPLOY_PORT" 120
print_success ingest
