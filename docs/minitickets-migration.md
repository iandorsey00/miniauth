# MiniTickets Migration

This document describes how MiniTickets should move from local auth to MiniAuth while keeping workspace authorization local to MiniTickets.

## Boundary

MiniAuth should own:

- user identity records
- password setup
- sign-in and sign-out
- email-code MFA
- shared sessions
- app access grants

MiniTickets should keep owning:

- ticket permissions
- app-specific settings and behavior

MiniAuth now also owns:

- shared workspace identity
- shared workspace memberships

MiniTickets should now keep owning:

- app-local workspace settings and behavior
- ticket permissions
- any app-specific authorization layered on top of shared membership truth

## Migration order

1. Keep current MiniTickets local auth working.
2. Export or copy identity records into MiniAuth:
   - email
   - display name
   - password hash
   - locale
   - active state
   - email MFA preference
3. Create `AppAccess` rows in MiniAuth for `minitickets`.
4. Begin issuing shared auth cookies from MiniAuth on the parent domain if the deployment domain layout allows it.
5. Replace MiniTickets local sign-in routes with redirects to MiniAuth.
6. Replace MiniTickets local session lookup with MiniAuth-backed identity lookup.
7. Import existing MiniTickets workspaces and memberships into MiniAuth with the one-off migration script:
   - `npm run migrate:minitickets-workspaces -- --source-db file:/var/www/minitickets/data/minitickets.db`
8. Enable MiniTickets shared-workspace sync.
9. Keep MiniTickets app-specific authorization local, but stop treating MiniTickets as the source of truth for shared workspace identity and membership.
10. After stable production validation, retire MiniTickets-local password setup, login challenge, and session tables.

## Recommended MiniTickets code changes

Keep the existing seam and swap the implementation under it:

- `lib/auth-service.ts`
  Replace local cookie and local session lookup with MiniAuth session resolution.
- `lib/auth.ts`
  Keep app-facing `getCurrentUser` and `requireUser`, but load identity from MiniAuth and then join to MiniTickets-local user or membership data as needed.
- auth routes and server actions
  Redirect login and setup flows to MiniAuth instead of handling passwords locally.

## Transitional model

For the first integration, MiniTickets can treat MiniAuth as the source of identity and still keep a lightweight local user reference keyed by email or a future external auth user id.

Recommended steps:

1. Add a stable `authUserId` field to the MiniTickets `User` model when you are ready for a stronger cross-app join.
2. On each authenticated request, resolve the MiniAuth user first.
3. Find or create the local MiniTickets user shell if needed.
4. Continue loading app-specific authorization from MiniTickets, but let shared workspace shells and memberships sync from MiniAuth.

## Workspace import notes

- The workspace import script lives in MiniAuth and reads MiniTickets SQLite data directly.
- It upserts workspaces by `slug`.
- It maps memberships by `authUserId` first and email second.
- It aborts if any membership cannot be mapped to a MiniAuth user.
- It does not move MiniTickets-only settings such as ticket prefix, payment configuration, or product-specific behavior.
- Run it after backing up both databases and before enabling `MINIAUTH_WORKSPACE_SYNC_ENABLED` in MiniTickets.

## Cookie and domain notes

- Prefer a shared parent-domain cookie only when both apps live under that parent domain.
- If that is not practical, use MiniAuth as the session authority and have MiniTickets exchange or verify identity through a server-side call instead.

## Data move notes

- Copy password hashes directly only if both apps use the same hashing scheme and verification rules.
- If not, invite users to reset passwords through MiniAuth instead of trying to reinterpret old hashes.
- Keep the original MiniTickets auth tables until the new path is proven in production.
- Take a database backup before deleting any local auth tables.
