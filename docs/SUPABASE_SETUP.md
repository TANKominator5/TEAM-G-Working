# BotStop Supabase connection

- Project: **BotStop**
- Project reference: `kihjfjgaeeuocilifcsd`
- API URL: `https://kihjfjgaeeuocilifcsd.supabase.co`
- Applied migration: `20261029072825_core_gateway.sql` (`core_gateway` in remote history).
- Applied AI migration: `20261029084105_ai_traffic_analyses.sql` (`ai_traffic_analyses`).

Both migrations are **already applied** through Supabase MCP. Do not apply them
again to BotStop. The local filenames match Supabase's recorded migration versions.

## Verified on the live database

- All four gateway/analysis tables exist with RLS enabled.
- `anon` and `authenticated` cannot read tables or execute gateway/stats RPCs.
- The server's `service_role` can update rolling windows, insert decisions, and
  retrieve aggregate stats with 60 minute buckets.
- Verification writes were wrapped in a transaction and rolled back, leaving no
  artificial traffic in the dashboard.
- Security advisors reported no warning/error findings. The four informational
  "RLS Enabled No Policy" notices are intentional: there is no browser data access,
  and the privileged backend role bypasses RLS.

The `gw_analyses` table stores validated advisory Groq findings and cache metadata.
The server role can select, insert, and delete; browser roles have no access.
Cleanup also removes analyses older than seven days.

## Runtime credentials

MCP authorization lets the coding agent manage the project; it does **not** log the
Next.js app into Supabase. The app still requires a separate server-side key.

Copy `.env.example` to `.env.local` if the local file does not already exist, then
set these values without sharing credentials in chat or committing them:

```dotenv
SUPABASE_URL=https://kihjfjgaeeuocilifcsd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret key from BotStop's API Keys settings>
GATEWAY_SECRET=<at least 32 random characters>
DASHBOARD_PASSWORD=<your strong dashboard password>
```

Prefer a new Supabase **secret** key (`sb_secret_...`); the legacy `service_role`
JWT also works. Do not use the publishable/anon key: the tables intentionally deny
it access. Keep the existing environment-variable name for either key type.

Generate a signing secret locally with `openssl rand -hex 32`. Restart the Next.js
server after changing `.env.local`. Configure the same variables separately in
Vercel, then redeploy. Never prefix these keys with `NEXT_PUBLIC_`.

## Verified application integration

The local Next.js application has now been tested against the actual BotStop REST
API with server credentials (no secrets were printed or committed):

- Unauthenticated telemetry returns 401; password login creates a working session.
- A normal request receives the protected inventory with HTTP 200.
- A suspicious request receives HTTP 403 and a signed challenge.
- Correct proof grants clearance; reusing the proof is rejected by the database.
- A bounded 23-request burst triggers HTTP 429 and `Retry-After`.
- Stats report all three decisions and 60 minute buckets; history contains the
  actual protected request IDs.

These checks generated real, bounded test traffic visible in recent decisions.
The loopback-only test server used distinct documentation-range client addresses
under an explicit trusted-proxy override; production IP trust was not changed.

The teammate's dashboard has also been verified in Chromium against live
Supabase: password login/logout, stats/history, expanded request details, protected
resource inspection, and a 390px mobile layout with no page overflow or JavaScript
errors. Deterministic browser regressions separately cover pagination, filters,
setup failures, and expired sessions.

The deployed Vercel application still requires end-to-end verification after
deployment. Local checks do not substitute for production verification.
