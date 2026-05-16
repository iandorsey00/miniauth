# Security Pass

Date: 2026-05-16

Scope reviewed:

- local-account sign-in
- password setup tokens
- login email challenges
- TOTP secret storage, TOTP login challenges, and recovery codes
- session issuance and revocation
- admin-only invite and session-revoke actions
- auth and dashboard presentation refresh
- minimal sign-in page simplification
- shared preference cookie issuance for locale, theme, and accent
- cookie-driven root theme and accent rendering compatibility
- Resend-backed MFA email delivery and login feedback-state restoration
- admin-only MFA toggle for existing users
- admin-only account enable/disable control for existing users
- admin-only app-access grant management for existing users
- bootstrap-only self-seed admin path
- same-origin enforcement for server actions
- trusted cross-app post-login redirects
- trusted cross-app logout redirects
- password-setup claim validation and setup-token cookie cleanup
- email MFA send throttling
- non-admin shared-preferences update surface
- shared workspace and membership truth
- dependency advisory state
- one-off MiniTickets workspace import tooling
- deployment and secret-handling defaults
- weekly review of logout handoff behavior after the 2026-04-30 hardening pass

Changes made during the pass:

- removed MFA code leakage through redirect query parameters
- removed password-setup token leakage through invite and resend redirect query parameters so the MiniAuth dashboard no longer rebuilds setup links from URL state
- moved password-setup entry onto a claim handoff route so emailed setup tokens are exchanged into an HttpOnly cookie before the password form loads, instead of remaining in the visible setup page URL during normal use
- limited invite and session-revocation actions to MiniAuth admins
- limited existing-user MFA toggles to MiniAuth admins
- limited existing-user enable/disable control to MiniAuth admins and revoked active shared sessions on disable so inactive accounts cannot continue through stale MiniAuth sessions
- limited existing-user app-access grant changes to MiniAuth admins, with normalized lowercase `appKey` handling and upsert behavior so app entry can be disabled cleanly by moving a grant to `INACTIVE` instead of forcing a user deletion or reinvite flow
- added a same-origin guard to server actions so authenticated mutations reject cross-origin form posts, including same-site subdomain posts that could otherwise carry parent-domain cookies
- added a guard against disabling, deactivating, or demoting the final active MiniAuth admin through the admin UI
- limited the self-seed admin path to the true bootstrap case only, so once any active MiniAuth admin exists, ordinary invited users can no longer grant themselves admin access
- limited cross-app post-login redirects to MiniAuth-relative paths, MiniAuth itself, or explicitly allowlisted trusted origins
- tightened relative `returnTo` validation so slash-backslash variants and protocol-relative edge cases are not accepted as post-login or post-logout targets
- kept shared logout redirects on the same validated return-target path so sign-out does not introduce a separate open-redirect surface
- changed shared logout so GET no longer revokes the session; a POST is now required for real logout, with the same validated return-target behavior preserved after the POST completes
- tightened the logout GET handoff again so only `same-origin` navigation auto-submits; same-site sibling subdomains now stop at the confirmation page instead of silently completing logout
- added authenticator-app TOTP MFA with encrypted secret storage and one-time hashed recovery codes
- made TOTP the preferred second factor when enabled on an account, so MiniAuth no longer depends on mailbox delivery for that user’s MFA step
- required current-password confirmation before starting or confirming TOTP enrollment, so a stolen live session cannot silently bind a new authenticator device on its own
- moved TOTP enrollment UX to a locally generated QR-code handoff so authenticator setup no longer depends on copying the raw provisioning URI into another app, while keeping manual-entry fallback available
- limited recovery-code display to a dedicated one-time signed recovery route, backed by a first-party handoff cookie and live-session check, so the codes no longer reappear on normal signed-in page loads or render on unauthenticated GET requests
- limited the new non-admin preferences surface to shared locale, theme, and accent updates only, with no user-management or app-access mutation capability exposed outside MiniAuth admins
- kept shared workspace ownership limited to workspace identity and membership truth rather than moving downstream app authorization into MiniAuth
- kept the one-off MiniTickets workspace import tool fail-closed by aborting on unresolved membership-user mappings instead of silently skipping or creating ambiguous membership records
- kept shared preference cookies constrained to neutral value transport rather than shared CSS or UI implementation
- kept cookie-driven root rendering limited to theme, accent, and locale presentation concerns rather than access control decisions
- added send, resend, and verify rate-limited MFA handling with explicit send-failure cleanup
- added an email verification resend cooldown so repeated clicks do not keep issuing fresh codes immediately
- applied the email MFA send limiter to the initial post-password MFA send as well as the resend path, so a correct password cannot be used to repeatedly issue fresh email codes without hitting the send cap
- reordered TOTP disable validation so a valid recovery code is not consumed when the submitted password is wrong
- validated password-setup tokens before storing them in the HttpOnly setup cookie, and stopped setup tokens from being minted or accepted for accounts that already have passwords
- cleared auth and shared-preference cookies with the same path and shared-domain attributes used when setting them, so logout and session cleanup behave correctly in parent-domain cookie deployments
- bumped audited dependencies and added narrow transitive overrides for patched `postcss` and `@hono/node-server` versions; `npm audit --audit-level=moderate` now reports zero vulnerabilities
- refreshed the lockfile during the 2026-05-16 weekly review so patched `next`, `fast-uri`, and `hono` artifacts are present in the installed tree and `npm audit --audit-level=moderate` still reports zero vulnerabilities
- kept deploy documentation placeholder-based so no private host or secret detail is committed
- kept production secrets and deploy env values out of the repo

Open follow-ups:

- keep the Resend sender domain, API key, and mail failure monitoring in the private operational runbook
- consider audit logging for admin auth actions
- consider replacing the temporary recovery-code cookie display step later with a dedicated one-time download or print flow if operator UX needs to become more polished
- consider a dedicated signed identity handoff endpoint for MiniTickets integration if shared cookies are not practical
- consider a dedicated shared-preferences update surface so apps do not need to mutate parent-domain cookies independently
- consider whether login and invite mail delivery should share a single higher-level mail module once MiniAuth sends all auth emails directly
- keep the trusted redirect-origin allowlist tight and first-party-only as additional apps join the shared-login family
- consider a more explicit sync or webhook path if more downstream apps begin mirroring shared workspace state from MiniAuth
- consider whether one-off workspace import tooling should later grow a dry-run mode or explicit reconciliation reporting if workspace sync becomes a recurring operational task

Visual refresh note:

- this pass changed layout, hierarchy, and styling only; it did not expand auth capabilities, add new data exposure, or loosen any authorization checks
- the stripped-down sign-in page remains presentation-only and does not change validation, redirects, or credential handling
- the MiniTickets-style sign-in alignment remains presentation-only and does not expand authentication scope, change cookie semantics, or loosen any access checks
- the broader dashboard and account-preference polish remains presentation and copy-only; moving remaining interface strings into the bilingual dictionary does not change permission logic or data access boundaries
- the dedicated lock app icon and top-left auth header refresh remain presentation-only and do not affect authentication, session validation, redirect handling, or data exposure
- the dark-mode surface rebalance remains presentation-only and does not alter authentication, authorization, cookie handling, or data exposure boundaries
- restoring the older centered login-card composition remains presentation-only and does not affect authentication, redirect handling, or credential validation
- aligning the MFA verification card with the login-page composition remains presentation-only and does not affect verification logic, resend handling, or credential validation
- removing the retired `miniassets` example text from the app-access UI is a copy-only cleanup and does not affect grant semantics or authorization behavior
- the TOTP setup QR code is generated locally inside MiniAuth and does not send the provisioning URI or shared secret to any third-party QR service
- the account-surface reorganization and Safari spacing cleanup remain presentation-only; they do not change session handling, auth state, permission checks, or data exposure
