#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MINIAUTH_ENV_FILE:-.env.production}"
SERVICE_NAME="${MINIAUTH_SERVICE_NAME:-miniauth}"
HEALTHCHECK_URL="${MINIAUTH_HEALTHCHECK_URL:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

echo "Using env file: $ENV_FILE"

set -a
source "$ENV_FILE"
set +a

echo "Installing dependencies..."
npm ci --include=dev

echo "Building app..."
npm run build

echo "Applying Prisma schema..."
npm run db:push

echo "Restarting service: $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"

if [[ -n "$HEALTHCHECK_URL" ]]; then
  echo "Checking health: $HEALTHCHECK_URL"
  curl --fail --silent --show-error "$HEALTHCHECK_URL"
  echo
fi
