# MiniAuth Portfolio Screenshots

## Manifest

1. `01-admin-overview.png` — Primary portfolio scene showing the synthetic admin overview, account health metrics, shared preferences, and authenticator controls.
2. `02-people-and-access.png` — Populated identity-management scene showing account state, app grants, and workspace membership controls.
3. `social-preview.png` — Tighter 2:1 crop of the primary scene for repository and social-link previews.

All visible people, email addresses, workspaces, sessions, and app grants are deterministic synthetic fixtures. The capture never reads the normal development or production database.

## Capture

From the repository root, run:

```sh
npm run portfolio:capture
```

The command creates a temporary SQLite database and browser profile, starts MiniAuth on a loopback address, captures both PNGs with a fixed light-mode desktop configuration, and removes the temporary state. Set `CHROME_PATH` if Chrome or Chromium is not in a standard location. `PORTFOLIO_URL` may override the default `http://127.0.0.1:3100`, but only loopback HTTP URLs are accepted.
