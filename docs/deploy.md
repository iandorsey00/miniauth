# Deploy

This document describes a repeatable single-droplet deployment path for MiniAuth without embedding any private hostnames, usernames, or secret values in the repo.

## Production shape

- one Node.js process running `next start`
- one reverse proxy in front of the app
- one SQLite database file on the server for the initial deployment path
- systemd managing the app process

## Required server inputs

Prepare these values outside the repo:

- app directory
- deploy environment file path
- domain name
- service port
- non-root app user and group
- absolute path to the Node.js bin directory

## Recommended layout

- app code in a dedicated app directory
- `.env.production` stored on the server, not committed
- systemd unit installed from [miniauth.service.example](/Users/iandorsey/dev/miniauth/deploy/miniauth.service.example)
- reverse proxy config installed from [site.conf.example](/Users/iandorsey/dev/miniauth/deploy/caddy/Caddyfile.example) or [site.conf.example](/Users/iandorsey/dev/miniauth/deploy/nginx/site.conf.example)

## First deploy

1. Clone the repo onto the server.
2. Install a supported Node.js version.
3. Copy `.env.example` to a server-local production env file and fill real values there.
4. Run `npm ci`.
5. Run `npm run build`.
6. Run `npm run db:push`.
7. Bootstrap the first admin:
   `npm run bootstrap:admin -- --email you@example.com --name "Your Name" --password "StrongPassword123!"`
8. Install and enable the systemd unit.
9. Install and reload the reverse proxy config.
10. Verify [health route](/Users/iandorsey/dev/miniauth/app/api/health/route.ts) and an end-to-end sign-in.

## Standard deploy flow

Prefer the deploy script over ad hoc shell history:

`bash scripts/deploy.sh`

The script expects a server-local env file path and will:

- restore accidental server-local `package-lock.json` drift before pulling
- fetch, checkout, and fast-forward the requested branch
- install exact dependencies with `npm ci --include=dev`
- build the app
- push the Prisma schema
- restart the systemd service
- optionally run a retrying final health check if `MINIAUTH_HEALTHCHECK_URL` is set

Health check retry tuning:

- `MINIAUTH_HEALTHCHECK_ATTEMPTS` defaults to `10`
- `MINIAUTH_HEALTHCHECK_SLEEP_SECONDS` defaults to `3`

## Health check

Confirm:

- the systemd service is active
- the reverse proxy reload succeeded
- `GET /api/health` returns `{"ok":true,"service":"miniauth"}`
- `GET /robots.txt` returns a full-site disallow policy
- a real sign-in and sign-out round trip works

## Browser behavior at the app hostname

Once the reverse proxy is pointing at MiniAuth correctly:

- `GET /` should redirect unauthenticated visitors to the MiniAuth sign-in page
- signed-in admins should land on the MiniAuth dashboard
- if you still see a Caddy welcome page, the hostname is still hitting the default Caddy site instead of the MiniAuth reverse proxy block

## Rollback

If a release fails after checkout:

1. Switch the server working tree back to the previous known-good commit.
2. Run `npm ci`.
3. Run `npm run build`.
4. If the schema changed incompatibly, restore the matching database backup before restart.
5. Restart the service.

For safety, take a database backup before schema-changing releases.

## Example command

Use the standard service name and production env file:

`MINIAUTH_ENV_FILE=.env.production MINIAUTH_SERVICE_NAME=miniauth MINIAUTH_HEALTHCHECK_URL=https://your-auth-host/api/health bash scripts/deploy.sh`
