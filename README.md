# MiniAuth

MiniAuth is a small shared login service for MiniTickets and related self-hosted apps.

## V0.1 scope

- local-account sign-in
- password setup links
- optional email-code MFA
- session issuance and revocation
- app access grants
- account active or inactive state
- auth rate limiting
- English and Simplified Chinese UI copy

## Stack

- Next.js
- TypeScript
- Prisma
- SQLite for local development

## Local setup

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Push the schema with `npm run db:push`
4. Bootstrap an admin with `npm run bootstrap:admin -- --email you@example.com --name "Your Name" --password "StrongPassword123!"`
5. Start the app with `npm run dev`

## Notes

- MFA email-code delivery now supports Resend. In development, the current login code is still shown on the verify page when mail delivery is not configured.
- Invite flow creates a password setup link for you to send through your own email workflow.
- App-local authorization is intentionally left to downstream apps; MiniAuth owns identity and session basics.
- Existing accounts can now have email MFA enabled or disabled directly from the MiniAuth admin dashboard.
- MiniAuth now carries shared preference values for locale, theme, and accent, and issues neutral shared cookies for downstream apps on the same parent domain.
- MiniAuth now also renders with MiniTickets-compatible `data-theme` and `data-accent` root attributes so the same shared preference values drive a compatible family look.
- The current UI uses a calmer auth layout, and the sign-in page keeps a minimal structure while still surfacing important sign-in feedback such as inactive-account, invalid-login, rate-limit, MFA-send, and password-setup success states.
- MiniAuth now accepts a validated `returnTo` target on login and MFA verification so trusted apps such as MiniTickets can send users back to their own post-login route after successful authentication.
- MiniAuth now also exposes a shared logout route so downstream apps can clear the shared MiniAuth session and send users back to their own sign-in screen in one step.
- The app serves `robots.txt` with a full-site disallow policy.
- Deployment and migration docs live in `docs/`:
  - `docs/deploy.md`
  - `docs/minitickets-migration.md`
  - `docs/security-pass.md`
