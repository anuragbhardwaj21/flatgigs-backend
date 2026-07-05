#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "==> Step 1/3: Wait for Postgres"
WAIT_REDIS=0 node dist/scripts/docker/wait-for.js

echo "==> Step 2/3: Download Inside Airbnb data"
node dist/scripts/ingest/download.js

echo "==> Step 3/3: Ingest data"
node dist/scripts/ingest/index.js

echo "==> Ingest pipeline complete"
