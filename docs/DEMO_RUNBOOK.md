# Sentinel demo-ready baseline

## Launch locally

Requires Node.js 24 LTS and the project `.env.local` at:

`/home/debajit/Projects/TEAM-G-Working/.env.local`

The project must have `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_SECRET`,
`DASHBOARD_PASSWORD`, and `GROQ_API_KEY`. Optional `GROQ_MODEL` defaults to
`openai/gpt-oss-120b`. Values in `/home/debajit/.env.local` are **not** loaded by
Next.js when this repository is the working directory.

```bash
git switch team-g-solution
git pull --rebase origin team-g-solution
npm ci
npm run dev
```

Open **http://localhost:3000** and sign in using `DASHBOARD_PASSWORD` from your
local file. Keep that password private; do not put it in the PR description.
BotStop already has both database migrations applied.

## Three-minute presentation

1. **Explain the problem (15 seconds).** "Sentinel is an API gateway that scores
   observed request behavior, explains its decisions, and protects an inventory API."
2. **Show normal access.** Click **1. Normal visitor**. One genuine request should
   be allowed. Expand its decision row to show the headers/timing/rate evidence.
3. **Show a challenge.** Click **2. Suspicious client**. Six requests omit the
   Accept and Accept-Language headers. Follow **Complete browser challenge**, click
   **Verify browser**, and wait for proof of work to finish. The page verifies the
   original issued token and retries the protected API; it should report HTTP 200.
   Return to the dashboard. Explain that proof of work adds automation cost, not
   proof of human identity; clearance cannot bypass hard limits.
4. **Show blocking.** Click **3. Burst traffic**. This sends exactly 24 concurrent
   requests (no repeating flood). Some should reach the 429 block threshold. Show
   `EXTREME_BURST`, its score contribution, and HTTP status in the decision feed.
5. **Show AI analysis.** Click **Analyze traffic**. Groq runs GPT-OSS 120B on
   privacy-preserving summaries; show the evidence, sampling limits, and advisory
   recommendation. It is explicitly told that demo traffic is a simulation, so it
   may correctly rate the malicious-intent risk low. Never promise a predetermined
   model result or present generated demo traffic as an actual attack.
6. **Show isolation and persistence.** Click **Try protected API**. Ordinary
   visitor access still works because authenticated demo runs have isolated rate
   windows. Refresh the page to show that decisions and AI findings persist.

### Demo behavior and limits

- The simulator sends actual HTTP requests to our own `/protected` endpoint.
  Scores and decisions are computed normally; they are not forced by a demo flag.
- Only a valid operator session can use the demo run header. Unauthenticated
  callers cannot rotate their rate-limit identity with it. Production requires a
  dashboard password. Demo traffic is capped at 100 requests/minute per operator IP.
- Demo requests are labeled `DEMO_TRAFFIC` in the decision reasons and included as
  simulations in AI summaries. Ordinary traffic is not relabeled.
- The suspicious scenario intentionally changes real observed headers; the burst
  scenario uses a fresh run ID and bounded concurrency. Slow networks can change
  timing-based results; the UI always reports the actual outcomes.
- At most two **new** AI calls can run per rolling minute across all instances.
  Identical snapshots may reuse a cached finding. If rate-limited, wait a minute;
  the gateway and saved findings remain available.
- If more than three full demo sequences are run in a minute, wait for the demo
  budget to cool down. Do not remove rate limits just to reset a presentation.
- Leave setup, missing-key, or provider errors visible rather than substituting
  fabricated traffic or AI output.

## Verified baseline

- All four README core requirements work together.
- Supabase-backed per-client windows and persistent decision metrics.
- Password login/logout and backend-only database access.
- Allow, challenge, valid proof, replay rejection, and hard blocking.
- Responsive dashboard, filters, pagination, request details, and API inspector.
- Operator-only normal/suspicious/burst demonstrations with real request logs.
- Real Groq authentication and GPT-OSS 120B inference; validated findings persist
  in Supabase and identical snapshots are cached.
- Live browser testing confirms that a demo burst does not block the ordinary
  visitor identity, and the model acknowledges simulation labels.

## Remaining before hackathon submission

1. **Deploy to Vercel.** Import the fork and deploy `team-g-solution` (not the
   starter `main` branch). Set the five required server variables and optionally
   `GROQ_MODEL=openai/gpt-oss-120b`. Keep `TRUST_PROXY=false`; Vercel is detected.
   No Vercel account connection is available in the coding session yet.
2. **Verify the public URL.** Repeat the walkthrough there, including login,
   persistence, challenge cookies, demo isolation, and real inference.
3. **Finalize submission.** Add the live URL, team member names, features, tech,
   and limitations to the PR against `Voyage-Hack4Haldia-26/TEAM-G:main`. Submit
   separately to the organizer's MLH/OrganizerHQ platform.

## Optional after this baseline is deployed

Honeypots, richer fingerprinting, Redis/Upstash for lower-latency high-volume rate
state, observe/enforce controls, exports, and a separately trained small classifier.
The Groq analyst is not a custom-trained bot classifier. These are stretch goals,
not blockers for the working core demo.
