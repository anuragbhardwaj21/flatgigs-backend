#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "==> Step 1/5: Wait for Postgres"
WAIT_REDIS=0 node dist/scripts/docker/wait-for.js

echo "==> Step 2/5: Apply migrations"
npx prisma migrate deploy

echo "==> Step 3/5: Enable pgvector"
node dist/scripts/docker/enable-pgvector.js

echo "==> Step 4/5: Download Inside Airbnb data"
node dist/scripts/ingest/download.js

echo "==> Step 5/5: Ingest data"
node dist/scripts/ingest/index.js

echo "==> Ingest pipeline complete"
