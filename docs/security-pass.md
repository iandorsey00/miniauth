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
- trusted cross-app post-login redirects
- deployment and secret-handling defaults

Changes made during the pass:

- removed MFA code leakage through redirect query parameters
- limited invite and session-revocation actions to MiniAuth admins
- limited existing-user MFA toggles to MiniAuth admins
- limited cross-app post-login redirects to MiniAuth-relative paths, MiniAuth itself, or explicitly allowlisted trusted origins
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

Visual refresh note:

- this pass changed layout, hierarchy, and styling only; it did not expand auth capabilities, add new data exposure, or loosen any authorization checks
- the stripped-down sign-in page remains presentation-only and does not change validation, redirects, or credential handling
- the MiniTickets-style sign-in alignment remains presentation-only and does not expand authentication scope, change cookie semantics, or loosen any access checks
