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

- Email-code delivery is stubbed for now. In development, the current login code is shown on the verify page after sign-in.
- Invite flow creates a password setup link for you to send through your own email workflow.
- App-local authorization is intentionally left to downstream apps; MiniAuth owns identity and session basics.
- MiniAuth now carries shared preference values for locale, theme, and accent, and issues neutral shared cookies for downstream apps on the same parent domain.
- MiniAuth now also renders with MiniTickets-compatible `data-theme` and `data-accent` root attributes so the same shared preference values drive a compatible family look.
- The current UI uses a calmer auth layout, and the sign-in page is intentionally reduced to a minimal card with only the essential fields and action.
- The app serves `robots.txt` with a full-site disallow policy.
- Deployment and migration docs live in `docs/`:
  - `docs/deploy.md`
  - `docs/minitickets-migration.md`
  - `docs/security-pass.md`
