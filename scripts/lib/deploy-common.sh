#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DEPLOY_ROOT"

DEPLOY_PORT="${PORT:-4000}"
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true
  set +a
  DEPLOY_PORT="${PORT:-4000}"
fi

require_command() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo ""
    echo "Missing required command: $cmd"
    echo "$hint"
    exit 1
  fi
}

print_install_hints() {
  echo ""
  echo "Install prerequisites:"
  echo "  Ubuntu/Debian: sudo apt update && sudo apt install -y docker.io docker-compose-v2 git curl"
  echo "  macOS:         https://docs.docker.com/desktop/"
  echo ""
}

require_git() {
  require_command git "  Ubuntu/Debian: sudo apt install -y git"
}

require_curl() {
  require_command curl "  Ubuntu/Debian: sudo apt install -y curl"
}

require_docker() {
  require_command docker "$(print_install_hints)"
  if ! docker info >/dev/null 2>&1; then
    echo ""
    echo "Docker is installed but the daemon is not running."
    echo "  Ubuntu: sudo systemctl start docker && sudo usermod -aG docker \$USER"
    echo "  macOS:  Start Docker Desktop"
    exit 1
  fi
}

require_compose() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    return 0
  fi
  echo ""
  echo "Docker Compose not found."
  print_install_hints
  exit 1
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

git_pull() {
  require_git
  if [ ! -d .git ]; then
    echo "==> Not a git repository — skipping git pull"
    return 0
  fi
  echo "==> git pull --ff-only"
  if ! git pull --ff-only; then
    echo ""
    echo "git pull failed. Resolve conflicts or local changes, then retry."
    exit 1
  fi
}

require_env() {
  local require_openai="${1:-0}"
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      echo "==> Creating .env from .env.example"
      cp .env.example .env
      echo "    Edit .env and set OPENAI_API_KEY, then re-run."
      exit 1
    else
      echo "Missing .env — create one from .env.example"
      exit 1
    fi
  fi

  # shellcheck disable=SC1091
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  DEPLOY_PORT="${PORT:-4000}"

  if [ "$require_openai" = "1" ]; then
    if [ -z "${OPENAI_API_KEY:-}" ]; then
      echo "OPENAI_API_KEY is required for ingest. Set it in .env"
      exit 1
    fi
  elif [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "Warning: OPENAI_API_KEY is not set — AI endpoints will return 503"
  fi
}

run_prereq_checks() {
  require_git
  require_curl
  require_docker
  require_compose
}

wait_for_health() {
  local port="${1:-$DEPLOY_PORT}"
  local timeout="${2:-120}"
  local elapsed=0

  echo "==> Waiting for health on port ${port} (timeout ${timeout}s)"
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -sf "http://localhost:${port}/health" >/dev/null 2>&1; then
      echo "    Health check passed"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  echo "Health check timed out. Logs: docker compose logs app"
  exit 1
}

print_success() {
  local mode="${1:-deploy}"
  echo ""
  echo "========================================"
  echo "  FlatGigs deployed successfully"
  echo "========================================"
  echo "  Health:  http://localhost:${DEPLOY_PORT}/health"
  echo "  API:     http://localhost:${DEPLOY_PORT}/api/v1"
  echo "  WS:      ws://localhost:${DEPLOY_PORT}/ws?token=<uuid-v4>"
  echo ""
  if [ "$mode" = "ingest" ]; then
    echo "  Ingest complete. Data loaded for Lisbon + Barcelona."
  fi
  echo "  Logs:    docker compose logs -f app"
  echo "========================================"
}
