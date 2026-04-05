# Security Pass

Date: 2026-04-04

Scope reviewed:

- local-account sign-in
- password setup tokens
- login email challenges
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
- trusted cross-app post-login redirects
- trusted cross-app logout redirects
- non-admin shared-preferences update surface
- shared workspace and membership truth
- one-off MiniTickets workspace import tooling
- deployment and secret-handling defaults

Changes made during the pass:

- removed MFA code leakage through redirect query parameters
- limited invite and session-revocation actions to MiniAuth admins
- limited existing-user MFA toggles to MiniAuth admins
- limited existing-user enable/disable control to MiniAuth admins and revoked active shared sessions on disable so inactive accounts cannot continue through stale MiniAuth sessions
- limited existing-user app-access grant changes to MiniAuth admins, with normalized lowercase `appKey` handling and upsert behavior so app entry can be disabled cleanly by moving a grant to `INACTIVE` instead of forcing a user deletion or reinvite flow
- limited the self-seed admin path to the true bootstrap case only, so once any active MiniAuth admin exists, ordinary invited users can no longer grant themselves admin access
- limited cross-app post-login redirects to MiniAuth-relative paths, MiniAuth itself, or explicitly allowlisted trusted origins
- kept shared logout redirects on the same validated return-target path so sign-out does not introduce a separate open-redirect surface
- limited the new non-admin preferences surface to shared locale, theme, and accent updates only, with no user-management or app-access mutation capability exposed outside MiniAuth admins
- kept shared workspace ownership limited to workspace identity and membership truth rather than moving downstream app authorization into MiniAuth
- kept the one-off MiniTickets workspace import tool fail-closed by aborting on unresolved membership-user mappings instead of silently skipping or creating ambiguous membership records
- kept shared preference cookies constrained to neutral value transport rather than shared CSS or UI implementation
- kept cookie-driven root rendering limited to theme, accent, and locale presentation concerns rather than access control decisions
- added send, resend, and verify rate-limited MFA handling with explicit send-failure cleanup
- kept deploy documentation placeholder-based so no private host or secret detail is committed
- kept production secrets and deploy env values out of the repo

Open follow-ups:

- add a real email delivery provider before production MFA or invite use
- consider CSRF hardening beyond framework defaults if cross-site auth entry points expand
- consider audit logging for admin auth actions
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
