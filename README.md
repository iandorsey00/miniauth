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
- Invite flow now sends the password setup email directly when mail delivery is configured, with the manual setup link still shown as a fallback if delivery fails.
- Admins can now resend a fresh password-setup invite from the MiniAuth dashboard for accounts that still have not set a password.
- App-local authorization is intentionally left to downstream apps; MiniAuth owns identity and session basics.
- Existing accounts can now have email MFA enabled or disabled directly from the MiniAuth admin dashboard.
- Existing accounts can now also be enabled or disabled directly from the MiniAuth admin dashboard; disabling an account revokes its live MiniAuth sessions so downstream apps stop treating it as an active user.
- Existing users can now have app access grants added or updated directly from the MiniAuth admin dashboard, including per-app role and active or inactive state, without reusing the invite flow.
- MiniAuth now carries shared preference values for locale, theme, and accent, and issues neutral shared cookies for downstream apps on the same parent domain.
- MiniAuth now also renders with MiniTickets-compatible `data-theme` and `data-accent` root attributes so the same shared preference values drive a compatible family look.
- Signed-in non-admin users now get a small MiniAuth account-preferences surface for shared locale, theme, and accent management instead of a dead-end dashboard screen.
- MiniAuth now also owns shared workspace identity and workspace membership truth for connected apps, without taking over app-specific ticket or product authorization.
- MiniAuth now includes a one-off MiniTickets workspace import script so existing shared workspaces and memberships can be copied into MiniAuth before downstream apps switch to synced workspace truth.
- The current UI uses a calmer auth layout, and the sign-in page keeps a minimal structure while still surfacing important sign-in feedback such as inactive-account, invalid-login, rate-limit, MFA-send, and password-setup success states.
- The broader dashboard and auth surfaces now follow a more cohesive bilingual polish pass, with more consistent spacing, calmer card and form rhythm, and dictionary-backed copy across the remaining admin and account-preference flows.
- MiniAuth now also uses a dedicated lock app icon and a quieter top-left auth header pattern across sign-in, verification, password-setup, and signed-in dashboard surfaces so branding feels more consistent with the wider app family.
- MiniAuth now accepts a validated `returnTo` target on login and MFA verification so trusted apps such as MiniTickets can send users back to their own post-login route after successful authentication.
- MiniAuth now also exposes a shared logout route so downstream apps can clear the shared MiniAuth session and send users back to their own sign-in screen in one step.
- The app serves `robots.txt` with a full-site disallow policy.
- Deployment and migration docs live in `docs/`:
  - `docs/deploy.md`
  - `docs/minitickets-migration.md`
  - `docs/security-pass.md`
