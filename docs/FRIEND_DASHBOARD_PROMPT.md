# Copy this prompt into your Codex

You are implementing ONE feature: the responsive live dashboard for Sentinel, Team G's bot-detection gateway, in a 2.5-hour hackathon. The backend is being built concurrently by my teammate. Repository: https://github.com/TANKominator5/TEAM-G-Working. Both of us use the SAME remote branch `team-g-solution`.

## Start and collaboration rules

1. Inspect your working tree first; never discard existing work. Fetch origin and switch to `team-g-solution` (tracking origin/team-g-solution); pull with rebase only with a clean working tree.
2. Read `lib/contracts.ts` and this prompt before coding. These are the agreed API types.
3. You exclusively own `app/page.tsx`, `app/globals.css`, and `components/**`. ONLY edit and commit those files. Do not edit package.json, lockfiles, app/layout.tsx, lib/**, app/api/**, app/protected/**, app/challenge/**, config, or database files. Ask the teammate for any dependency or contract change.
4. Use the installed Next.js App Router, React, TypeScript, and Tailwind. Use inline SVG/CSS for charts/icons; avoid adding dependencies. No external font downloads.

## Feature requirements

Create a polished, mobile-friendly cybersecurity dashboard called **Sentinel**. Dark navy background, restrained emerald/cyan accents, readable typography, clear status badges. Include:

- Header with product name, connection status, refresh button, sign-out.
- Four cards: total requests, allowed, challenged, blocked (last 60 minutes).
- Real time-series traffic chart from the stats API and average risk score/latency.
- Recent decisions table: timestamp, anonymized client, method/path, score, decision, response status. Expand a row to show each scoring reason and observed request features.
- Decision filter (all/allow/challenge/block) and load-more cursor pagination.
- Poll every 5 seconds with cancellation/cleanup; avoid overlapping requests, stale filter responses, or duplicate rows. Pause automatic first-page replacement when viewing older pages, or reset pagination explicitly on refresh/filter changes.
- Loading, empty, unauthorized, database-not-configured, and network-error states. Never show fake traffic as live data. Render untrusted text safely (no dangerouslySetInnerHTML).
- A "Try protected API" button calls GET /protected with credentials and shows the actual HTTP status, score, decision, reasons, and allowed resource JSON. If challenged, link to `/challenge?returnTo=/` (the backend teammate owns that page). Do not implement a traffic generator in this feature.
- Small explanation that heuristics are signals, not proof of bot activity.

## API contract (same-origin fetch, credentials included)

- `GET /api/auth` -> `{ authenticated: boolean, required: boolean }`.
- `POST /api/auth` with JSON `{ password: string }` -> `{ authenticated: true }`; sets HttpOnly session cookie. Show a password form if required; never persist the password in localStorage or expose server secrets.
- `DELETE /api/auth` -> `{ authenticated: false }`.
- `GET /api/stats` -> `StatsResponse` in lib/contracts.ts (last 60 minutes, minute buckets).
- `GET /api/decisions?limit=25&decision=allow|challenge|block&cursor=<opaque>` -> `DecisionsResponse`; omit decision for all, nextCursor null means end.
- `GET /protected` -> `GatewayResponse`; HTTP 200 allow, 403 challenge, 429 block. Challenge includes token/difficulty/expiresAt; don't solve it here, use the challenge-page link.
- Errors -> `{ error: string, code: string }`, notably 401 unauthorized and 503 setup/storage unavailable. Read JSON bodies even when response.ok is false. Do not confuse an infrastructure error with a gateway decision.
- The APIs may not exist while you begin. Implement against the types, using mock data only during local development and never in the committed live dashboard.

## Acceptance and handoff

Run `npm run typecheck` and `npm run build` once backend integration permits. Verify mobile layout, login/logout, empty/error states, refresh/poll cleanup, pagination, and request inspector. Don't claim checks passed if blocked by missing configuration. Commit ONLY your owned files with a descriptive message, fetch and rebase onto origin/team-g-solution, resolve only your own files, then push to origin/team-g-solution. Never force-push. If another push races yours, fetch/rebase and retry. Return the commit SHA, files changed, checks run, and any integration issues.
