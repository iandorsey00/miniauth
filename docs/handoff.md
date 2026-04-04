# Handoff

## Purpose

MiniAuth is a small shared login service for MiniTickets and related self-hosted apps.

## Current scope

- local-account sign-in
- password setup links
- optional email-code MFA
- shared sessions
- app access grants
- account active and inactive state
- basic auth rate limiting
- bilingual English and Simplified Chinese UI copy

## Operational notes

- the first real admin should be created deliberately during deploy bootstrap
- production email delivery is not wired yet; development currently uses an on-page preview code flow for MFA
- deployment docs intentionally use placeholders and examples only; keep private host and secret details in private runbooks or server-local env files
- use [deploy.md](/Users/iandorsey/dev/miniauth/docs/deploy.md) for build, deploy, health-check, and rollback steps
- use [minitickets-migration.md](/Users/iandorsey/dev/miniauth/docs/minitickets-migration.md) for the MiniTickets integration path

## Near-term follow-ups

- add a real email provider for invites and MFA
- add a machine-to-machine identity verification path for apps that cannot share a parent-domain cookie
- add structured admin audit logs
