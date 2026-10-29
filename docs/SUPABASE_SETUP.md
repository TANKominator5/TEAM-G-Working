# BotStop Supabase connection

- Project: **BotStop**
- Project reference: `kihjfjgaeeuocilifcsd`
- API URL: `https://kihjfjgaeeuocilifcsd.supabase.co`
- Applied migration: `20261029072825_core_gateway.sql` (`core_gateway` in remote history).
- Applied AI migration: `20261029084105_ai_traffic_analyses.sql` (`ai_traffic_analyses`).
- Applied security-signal migration: `20261029102952_fingerprint_honeypot_signals.sql`.

All three migrations are **already applied** through Supabase MCP. Do not apply them
again to BotStop. The local filenames match Supabase's recorded migration versions.

## Verified on the live database

- All six gateway/analysis/security-signal tables exist with RLS enabled.
- `anon` and `authenticated` cannot read tables or execute gateway/stats RPCs.
- The server's `service_role` can update rolling windows, insert decisions, and
  retrieve aggregate stats with 60 minute buckets.
- Verification writes were wrapped in a transaction and rolled back, leaving no
  artificial traffic in the dashboard.
- Security advisors reported no warning/error findings. The six informational
  "RLS Enabled No Policy" notices are intentional: there is no browser data access,
  and the privileged backend role bypasses RLS.

The `gw_analyses` table stores validated advisory Groq findings and cache metadata.
The server role can select, insert, and delete; browser roles have no access.
Cleanup also removes analyses older than seven days.

`gw_signals` records passive fingerprint changes in 10-minute activity windows.
`gw_honeypots` keeps at most 20 trap timestamps per IP-hash/fingerprint pair for a
rolling ten minutes. The backend-only `gw_observe_security` RPC serializes updates.
Both tables expire after one day through cleanup. Live transaction-rolled-back
checks verified trap persistence and browser-role denial before deployment.

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

Groq is now configured in the project's ignored `.env.local`. The account's model
catalog does not list Llama 3.3 70B, so the verified default is the open-weight
`openai/gpt-oss-120b`. A real finding returned in about 3.5 seconds, passed schema
validation, persisted to BotStop, and was reused on an identical cached request.
An additional live browser run verified the isolated normal/challenge/burst demo,
actual proof completion and retry, real model analysis with simulation labeling,
and continued ordinary visitor access after the demo burst.

## Verified public Vercel deployment

Live URL: **https://sentinel-team-g.vercel.app**

Vercel project: `sentinel-team-g` (`prj_fhtl2xPEnsg4jN7DUkIivVGH9yL9`),
team `tankominator5s-projects`, function region `icn1`, Node.js 24.
Initial verified production deployment: `dpl_2k2PqgDErssRAYvT95zc98jpMAad`,
source commit `fff63b98731c76a55184dcc9eaf79934844f7ccd` on `team-g-solution`.

Production variables were configured without uploading `.env.local`. The four
credentials/signing/password values are sensitive variables; URL, model, and proxy
mode are plain configuration. No secret values are committed in this repository.

Production Chromium checks passed for password login, Secure/HttpOnly admin and
clearance cookies, real normal/challenge/burst scenarios, successful challenge
retry, ordinary-visitor isolation, persisted telemetry, real Groq inference,
reload persistence, mobile overflow, and logout access denial. The bounded burst
yielded 5 allowed, 15 challenged, and 4 blocked requests. No browser runtime errors
were observed. Public liveness returned configured=true; unauthenticated stats
correctly returned HTTP 401.
