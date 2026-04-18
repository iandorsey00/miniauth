# Handoff

## Purpose

MiniAuth is a small shared login service for MiniTickets and related self-hosted apps.

## Current scope

- local-account sign-in
- password setup links
- optional email-code MFA
- optional authenticator-app TOTP MFA with recovery codes
- Resend-backed MFA email delivery
- shared sessions
- shared locale, theme, and accent preference values
- app access grants
- account active and inactive state
- basic auth rate limiting
- bilingual English and Simplified Chinese UI copy

## Operational notes

- the first real admin should be created deliberately during deploy bootstrap
- the self-seed admin button is now bootstrap-only and should appear only when there are zero active MiniAuth admins
- MFA email delivery is now wired through Resend when configured; development can still fall back to the on-page preview code flow
- MiniAuth now also supports authenticator-app TOTP MFA with recovery codes, intended especially for admin accounts that do not want mailbox-based MFA dependency or resend-cost exposure
- TOTP enrollment requires the current password at both setup start and confirmation time, so a stolen live session alone is not enough to bind a new authenticator device
- successful TOTP enablement currently turns off email MFA for that account, so TOTP becomes the primary second factor there
- TOTP setup now shows a locally generated QR code for authenticator apps, while still keeping the raw secret and provisioning URI visible as fallback for manual entry
- the TOTP setup code blocks now wrap long provisioning URIs cleanly instead of stretching the preferences or dashboard panels
- recovery codes are hashed in the database and shown only through a dedicated one-time recovery route immediately after TOTP enablement; that route now requires both a live signed-in MiniAuth session and a first-party handoff cookie before it renders
- email verification code resend is now gated by a cooldown so repeated clicks do not keep issuing fresh codes immediately
- invite/password-setup email now also uses the Resend mail path when configured, and invite or resend redirects no longer expose raw password-setup tokens in dashboard URLs; send failure now returns as status only so resend is the recovery path
- password-setup links now land on a claim handoff that exchanges the emailed token into an HttpOnly cookie before rendering the setup form, so the raw token no longer remains in the visible form URL after arrival
- admins can now resend a fresh password-setup invite from the dashboard for accounts that still have not set a password
- existing users can now have email MFA enabled or disabled directly from the MiniAuth admin dashboard without reusing the invite path
- existing users can now also be enabled or disabled directly from the MiniAuth admin dashboard, and disabling a user revokes active MiniAuth sessions so downstream apps see the account as inactive immediately
- existing users can now also have app access grants added or updated directly from the MiniAuth admin dashboard, including per-app `role` and `state`, so admins do not need to reuse the invite form to grant a new downstream app
- MiniAuth now stores shared `locale`, `themePreference`, and `accentColor` values and writes neutral shared cookies for compatible apps on the same parent domain
- MiniAuth now reads those shared values back into root `data-theme` and `data-accent` attributes so its rendering model stays compatible with MiniTickets
- signed-in non-admin users now land on a lightweight MiniAuth account-preferences surface where they can update shared locale, theme, and accent values without seeing admin-only controls
- MiniAuth now also owns shared workspace identity and shared workspace memberships so related apps can draw from one workspace list and one membership source
- shared workspaces in MiniAuth intentionally stop at identity and membership truth; app-specific permissions and workspace behavior still belong in each downstream app
- MiniAuth now includes a one-off MiniTickets workspace import script so existing MiniTickets `Workspace` and `WorkspaceMembership` rows can be copied into MiniAuth before downstream sync is enabled
- the workspace import script maps memberships by `authUserId` first and email second, and it fails closed if any membership cannot be resolved to a MiniAuth user
- MiniAuth now accepts a validated `returnTo` URL on login and MFA verification so trusted first-party apps can hand users back to their own post-login route instead of always landing on the MiniAuth dashboard
- trusted post-login return origins should be declared explicitly through `ALLOWED_RETURN_TO_ORIGINS`; do not treat arbitrary redirect targets as valid
- MiniAuth now also exposes a shared logout route so first-party apps can sign users out of the central session and then return them to the calling app's login screen
- shared logout now uses a GET handoff page plus POST destroy flow, so passive cross-site GET requests no longer revoke the shared session directly
- production TOTP requires `AUTH_TOTP_ENCRYPTION_KEY` in the server-local env; treat that as restore-critical secret material alongside mail and cookie configuration
- the auth pages and admin dashboard now follow a calmer, more restrained presentation pass rather than the original scaffold styling
- the primary sign-in page now intentionally mirrors the MiniTickets login structure and spacing so the shared-login experience feels consistent across apps, while keeping the MiniAuth Chinese and English product name
- the sign-in page now again surfaces important login feedback states such as invalid credentials, inactive account, send failure, rate limiting, and password-setup success without expanding the page back into a cluttered layout
- the broader admin dashboard, non-admin preferences surface, and setup or verify flows now also share a more polished spacing and panel system, with the remaining operational copy moved into the bilingual dictionary instead of living as scattered hardcoded English
- the auth flows and signed-in dashboard now also use a dedicated lock app icon and a quieter top-left product header instead of the older oversized centered hero treatment, so the MiniAuth experience feels closer to the rest of the app family without changing auth behavior
- the login page specifically now returns to the earlier centered card treatment, while the dashboard and the other auth flows keep the quieter top-left header approach
- the MFA verification page now uses that same centered card treatment so the login and verification steps stay visually consistent
- the login and verification brand stack now uses the smaller GeoCompare-style wordmark treatment instead of the oversized hero headline, and the English login intro now reads more naturally as `Use one account...`
- with MiniAssets retired, the app-access example placeholder now points at a still-live app key instead of `miniassets`
- dark-mode card, form, note, and panel surfaces have also been rebalanced so the dashboard reads more cleanly in dark theme without the earlier light-biased overlay feel
- the app serves a site-wide `robots.txt` disallow so search engines are asked not to index MiniAuth
- deployment docs intentionally use placeholders and examples only; keep private host and secret details in private runbooks or server-local env files
- the deploy script now mirrors the MiniTickets flow more closely, including restoring server-local `package-lock.json` drift before pull and retrying the final health check instead of failing on the first transient public 502
- use [deploy.md](/Users/iandorsey/dev/miniauth/docs/deploy.md) for build, deploy, health-check, and rollback steps
- use [minitickets-migration.md](/Users/iandorsey/dev/miniauth/docs/minitickets-migration.md) for the MiniTickets integration path

## Near-term follow-ups

- add a machine-to-machine identity verification path for apps that cannot share a parent-domain cookie
- add structured admin audit logs
