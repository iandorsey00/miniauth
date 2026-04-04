#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MINIAUTH_ENV_FILE:-.env.production}"
SERVICE_NAME="${MINIAUTH_SERVICE_NAME:-miniauth}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

echo "Using env file: $ENV_FILE"

set -a
source "$ENV_FILE"
set +a

npm ci
npm run build
npm run db:push
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
