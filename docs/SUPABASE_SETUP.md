# BotStop Supabase connection

- Project: **BotStop**
- Project reference: `kihjfjgaeeuocilifcsd`
- API URL: `https://kihjfjgaeeuocilifcsd.supabase.co`
- Applied migration: `20261029072825_core_gateway.sql` (`core_gateway` in remote history).

The core migration is **already applied** through Supabase MCP. Do not apply it
again to BotStop. The local filename matches Supabase's recorded migration version.

## Verified on the live database

- All three gateway tables exist with RLS enabled.
- `anon` and `authenticated` cannot read tables or execute gateway/stats RPCs.
- The server's `service_role` can update rolling windows, insert decisions, and
  retrieve aggregate stats with 60 minute buckets.
- Verification writes were wrapped in a transaction and rolled back, leaving no
  artificial traffic in the dashboard.
- Security advisors reported no warning/error findings. The three informational
  "RLS Enabled No Policy" notices are intentional: there is no browser data access,
  and the privileged backend role bypasses RLS.

## Remaining: runtime credentials

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

The application-level REST connection and deployed demo must still be verified
once that server credential is configured. Database checks alone are not an
end-to-end deployment test.
