#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/deploy-common.sh"

git_pull
run_prereq_checks
require_env 0

echo "==> Building and starting services"
compose up -d --build

wait_for_health "$DEPLOY_PORT"
print_success deploy
