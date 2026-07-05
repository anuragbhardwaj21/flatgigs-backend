#!/usr/bin/env bash
set -euo pipefail

node dist/scripts/docker/wait-for.js

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Enabling pgvector extension"
node dist/scripts/docker/enable-pgvector.js

exec "$@"
