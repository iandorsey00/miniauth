# Handoff

## Purpose

MiniAuth is a small shared login service for MiniTickets and related self-hosted apps.

## Current scope

- local-account sign-in
- password setup links
- optional email-code MFA
- shared sessions
- shared locale, theme, and accent preference values
- app access grants
- account active and inactive state
- basic auth rate limiting
- bilingual English and Simplified Chinese UI copy

## Operational notes

- the first real admin should be created deliberately during deploy bootstrap
- production email delivery is not wired yet; development currently uses an on-page preview code flow for MFA
- MiniAuth now stores shared `locale`, `themePreference`, and `accentColor` values and writes neutral shared cookies for compatible apps on the same parent domain
- MiniAuth now reads those shared values back into root `data-theme` and `data-accent` attributes so its rendering model stays compatible with MiniTickets
- the auth pages and admin dashboard now follow a calmer, more restrained presentation pass rather than the original scaffold styling
- the primary sign-in page now intentionally mirrors the MiniTickets login structure and spacing so the shared-login experience feels consistent across apps, while keeping the MiniAuth Chinese and English product name
- the app serves a site-wide `robots.txt` disallow so search engines are asked not to index MiniAuth
- deployment docs intentionally use placeholders and examples only; keep private host and secret details in private runbooks or server-local env files
- use [deploy.md](/Users/iandorsey/dev/miniauth/docs/deploy.md) for build, deploy, health-check, and rollback steps
- use [minitickets-migration.md](/Users/iandorsey/dev/miniauth/docs/minitickets-migration.md) for the MiniTickets integration path

## Near-term follow-ups

- add a real email provider for invites and MFA
- add a machine-to-machine identity verification path for apps that cannot share a parent-domain cookie
- add structured admin audit logs
