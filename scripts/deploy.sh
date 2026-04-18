#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/miniauth}"
BRANCH="${BRANCH:-main}"
NODE_BIN_DIR="${NODE_BIN_DIR:-/usr/bin}"
SERVICE_NAME="${MINIAUTH_SERVICE_NAME:-miniauth}"
ENV_FILE="${MINIAUTH_ENV_FILE:-$APP_DIR/.env.production}"
HEALTHCHECK_URL="${MINIAUTH_HEALTHCHECK_URL:-}"
HEALTHCHECK_ATTEMPTS="${MINIAUTH_HEALTHCHECK_ATTEMPTS:-10}"
HEALTHCHECK_SLEEP_SECONDS="${MINIAUTH_HEALTHCHECK_SLEEP_SECONDS:-3}"

export PATH="$NODE_BIN_DIR:$PATH"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

echo "Deploying MiniAuth from branch: $BRANCH"
cd "$APP_DIR"

if git diff --quiet -- package-lock.json; then
  :
else
  echo "Restoring server-local package-lock.json changes before pull"
  git restore package-lock.json
fi

git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

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
  attempt=1

  until curl --fail --silent --show-error "$HEALTHCHECK_URL"; do
    if (( attempt >= HEALTHCHECK_ATTEMPTS )); then
      echo
      echo "Health check failed after ${HEALTHCHECK_ATTEMPTS} attempts."
      exit 1
    fi

    echo
    echo "Health check attempt ${attempt}/${HEALTHCHECK_ATTEMPTS} failed. Retrying in ${HEALTHCHECK_SLEEP_SECONDS}s..."
    sleep "$HEALTHCHECK_SLEEP_SECONDS"
    attempt=$((attempt + 1))
  done

  echo
fi
