#!/usr/bin/env bash
set -euo pipefail

node dist/scripts/docker/wait-for.js
exec "$@"
