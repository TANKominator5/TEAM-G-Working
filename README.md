# Team G: Bot Detection Gateway

> Protect an API from bots and scrapers

## Sentinel — our implementation

**Next.js + TypeScript + Tailwind + Supabase PostgreSQL**, deployable to Vercel.
The original event brief is preserved below. The old Flask/Express files are
starter references only; `npm` now runs the Next.js application.

### Current core features

- Application-layer middleware (`lib/gateway.ts`) scores every request to the
  protected resource using real headers, request frequency, and timing regularity.
- Explainable 0–100 risk score: **allow <40**, **challenge 40–79**, **block ≥80**.
- Per-client 10-second/60-second rolling windows persisted in Supabase. A row lock
  serializes updates across Vercel instances; no process-local counters are used.
- `/protected` returns inventory data only when allowed; challenges return 403,
  blocks return 429 with `Retry-After`.
- Working SHA-256 proof-of-work challenge, signed client-bound tokens, one-time
  database redemption, and a 15-minute HttpOnly clearance cookie. Clearance never
  bypasses hard blocks. Proof of work adds cost, not proof of human identity.
- Persistent decisions, minute-bucket metrics, cursor pagination, and dashboard
  APIs. **Dashboard UI is assigned to our frontend teammate**; see the handoff below.
- Password-protected telemetry in production with rate-limited login and signed
  HttpOnly session cookies. No raw IPs or authorization/cookie headers are stored.

### Local setup

Requires Node.js **22+** (24 LTS recommended).

```bash
git switch team-g-solution
npm ci
cp .env.example .env.local
openssl rand -hex 32
```

1. Create/select a Supabase project. Run
   [`supabase/migrations/20261029072825_core_gateway.sql`](supabase/migrations/20261029072825_core_gateway.sql)
   **once** in its SQL Editor (or apply it through your connected Supabase MCP).
   **Our BotStop project is already migrated; do not run it again there.**
   See [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) for the verified project
   URL and remaining runtime configuration.
2. Fill `.env.local` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the
   generated `GATEWAY_SECRET`. Set a strong `DASHBOARD_PASSWORD` (required in
   production; optional locally). Never commit these secrets or prefix them with
   `NEXT_PUBLIC_`. Supabase legacy service-role JWTs and new `sb_secret_` keys are
   supported by the server-side REST adapter.
3. Run `npm run dev` and open `http://localhost:3000`.
4. Open `/protected` in a browser. Visit `/challenge` to complete a browser check
   when challenged. All local requests deliberately share one development identity.

Without valid Supabase configuration/migration, protected requests and telemetry
return **503**, not fabricated traffic or an unprotected resource.

### Teammate dashboard handoff

Give your friend's Codex [`docs/FRIEND_DASHBOARD_PROMPT.md`](docs/FRIEND_DASHBOARD_PROMPT.md).
It contains the full task, API contract, file ownership, and same-branch Git rules.
Frontend owns `app/page.tsx`, `app/globals.css`, and `components/**`; backend owns
the remaining implementation files. Shared response types are in `lib/contracts.ts`.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness and configuration presence (not a database connectivity check) |
| GET | `/protected` | Gateway-enforced demo resource; returns score, reasons, decision |
| POST | `/api/score` | Admin-only scoring **preview** from validated features; never authorizes real traffic |
| GET | `/api/stats` | Admin-only metrics for the current and previous 59 minute buckets |
| GET | `/api/decisions?limit=25&decision=allow&cursor=...` | Admin-only persistent decision history |
| GET / POST / DELETE | `/api/auth` | Session state / password login / logout |
| POST | `/api/challenge/verify` | Redeem `{ token, solution }` and set clearance cookie |

`/api/score` expects all fields in `RequestFeatures` from `lib/contracts.ts`, e.g.:

```json
{"userAgent":"Mozilla/5.0","hasAccept":true,"hasAcceptLanguage":true,"requests10s":1,"requests60s":1,"intervalCount":0,"intervalCv":null}
```

Health and dashboard polling are not counted as protected-resource traffic.
All telemetry and decisions use `Cache-Control: no-store`. Infrastructure failures
are distinct from bot decisions: `{ "error": "...", "code": "..." }` with 503.

### Verify

```bash
npm test
npm run typecheck
npm run build
```

Tests cover scoring, enforcement, challenge proofs, auth, input limits, pagination,
the REST adapter, and the **actual SQL migration** using PostgreSQL-in-WASM (PGlite).
The test database is not an application storage fallback. Live Supabase and Vercel
must also be checked after configuring credentials.

### Deploy to Vercel

1. Import `TANKominator5/TEAM-G-Working`, framework **Next.js**.
2. Select `team-g-solution` as the production branch, or deploy its preview.
3. Add the four required environment variables listed above to the relevant
   Vercel environments. Keep `TRUST_PROXY=false`; Vercel is auto-detected and its
   platform-overwritten `x-vercel-forwarded-for` header supplies the client IP.
4. Deploy and check `/health`, normal access, a challenge, a rate-limit block, and
   dashboard persistence. Apply the Supabase migration before this check.
5. Schedule `select public.gw_cleanup();` daily using Supabase Cron, or run manually
   for the hackathon. It retains decision history for 7 days, client state for 1 day,
   and removes expired challenge redemptions.

Outside Vercel, production requires an IP-overwriting trusted proxy and explicit
`TRUST_PROXY=true`. Never enable this behind an untrusted forwarding proxy.

### Honest limits / next steps

This is a hackathon gateway, not a replacement for an edge WAF. Shared-IP users
share rate budgets, user agents are spoofable, and timing is only a supporting
signal. Supabase-backed rolling windows suit demo traffic; Upstash/Redis can be
added for higher-throughput enforcement. The core intentionally does not require
another service to provision before the demo works. Latency metrics cover scoring
and resource preparation, excluding the final decision-log write/network response.
Groq/open-weight AI traffic analysis is the next feature, after the core works;
`GROQ_API_KEY` is reserved in `.env.example` but is not used or required yet.

---

## Original hackathon brief

**Hack4Haldia'26** is a 3-hour build challenge. This is your starter repository. Build new features on top of it, integrate them, **deploy the working project**, and open a **Pull Request** on this repository. AI tools and open-source / open-weight models are fully allowed.

## The Problem

Bots and AI agents hammer websites. Build a gateway that scores every request and blocks or challenges suspicious ones.

## Must-have (core, do these first)

- [ ] Middleware that scores each request (headers, timing, request rate)
- [ ] Allow / challenge / block decisions with reasons
- [ ] Protected demo route behind the gateway
- [ ] Dashboard of recent decisions

## Bonus (only after the core works end to end)

- [ ] Request fingerprinting
- [ ] Honeypot links/fields
- [ ] Small ML classifier trained on simulated traffic
- [ ] Per-IP rolling windows

## Industry-level tech we expect you to use

- Middleware design
- Rate limiting
- Behavioural scoring
- Logging + metrics

A toy in-memory demo is not enough. Use real tools (database, auth, queue, model etc.) where it makes sense.

## What is already here

| File | Purpose |
|---|---|
| `index.html` | Starter UI with an API tester. Replace it with your real frontend. |
| `app.py` + `requirements.txt` | **Python / Flask** starter |
| `script.js` + `package.json` | **Node / Express** starter |

Pick **ONE** stack and delete the other, or keep both if you want. Both expose the same endpoints:

| Method | Path | What it should do |
|---|---|---|
| `GET` | `/health` | Already working |
| `POST` | `/api/score` | Body: request features -> {score, decision} |
| `GET` | `/api/stats` | Allowed vs blocked counts |
| `GET` | `/protected` | Demo route guarded by your middleware |

All the endpoints above return `501 Not Implemented` until you build them. Add more endpoints if you need.

## Run locally

**Python**
```bash
pip install -r requirements.txt
python app.py        # http://localhost:5000
```

**Node**
```bash
npm install
npm start            # http://localhost:3000
```

Put secrets in a `.env` file. **Never commit API keys.**

## Deploy (required)

Your project must be live on a public URL. Easiest options:
- **Render**: Web Service, connect the repo. Python start command: `gunicorn app:app`. Node: `npm start`.
- Vercel / Railway / Fly.io also fine.

Add the live URL at the top of your PR description.

## Submit

1. Create a branch: `git checkout -b team-g-solution`
2. Commit and push your work.
3. Open a **Pull Request** against `main` of **this** repository.
4. PR description must include: live URL, what you built, tech used, team members.
5. Also submit on the official **MLH platform (OrganizerHQ)**. Instructions will be given at the start of the event.

## Rules

- Teams of 3 to 4. Every member must be present.
- 3 hours total. Commit often.
- AI tools are open. You must still understand and be able to explain your code.

## Judging

Working demo (35%) | Technical depth (25%) | Completeness of core features (20%) | Deployment (10%) | Presentation (10%)

Good luck, build something great!
