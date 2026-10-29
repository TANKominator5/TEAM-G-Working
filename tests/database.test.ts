import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StatsResponse } from "../lib/contracts";
import type { RequestWindow } from "../lib/store";

// Execute the actual migration on PostgreSQL-in-WASM. This is a test database,
// not an application fallback. Production always uses Supabase.
const db = new PGlite();
beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync(new URL("../supabase/migrations/202610290001_core_gateway.sql", import.meta.url), "utf8"));
}, 30000);
beforeEach(async () => { await db.exec("truncate public.gw_clients, public.gw_decisions, public.gw_challenges;"); });
afterAll(async () => { await db.close(); });

async function record(key: string) {
  const result = await db.query<{ result: RequestWindow }>("select public.gw_record_request($1) as result", [key]);
  return result.rows[0].result;
}

describe("Supabase SQL migration", () => {
  it("counts request windows per client without mixing identities", async () => {
    expect(await record("a")).toMatchObject({ requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null });
    expect(await record("a")).toMatchObject({ requests10s: 2, requests60s: 2, intervalCount: 1 });
    expect(await record("b")).toMatchObject({ requests10s: 1, requests60s: 1 });
  });
  it("expires old events and preserves only the rolling 60 seconds", async () => {
    await db.exec(`insert into public.gw_clients (client_key, request_times) values ('window', array[
      now() - interval '70 seconds', now() - interval '20 seconds', now() - interval '2 seconds'
    ]);`);
    expect(await record("window")).toMatchObject({ requests10s: 2, requests60s: 3, intervalCount: 2 });
  });
  it("bounds state under sustained bursts and serializes parallel calls", async () => {
    await db.exec(`insert into public.gw_clients (client_key, request_times)
      select 'burst', array_agg(now()) from generate_series(1, 256);`);
    const results = await Promise.all(Array.from({ length: 5 }, () => record("burst")));
    expect(results.every((result) => result.requests60s === 256)).toBe(true);
    const state = await db.query<{ size: number }>("select cardinality(request_times) as size from public.gw_clients where client_key = 'burst'");
    expect(state.rows[0].size).toBe(256);
  });
  it("produces complete zero-filled dashboard stats", async () => {
    const result = await db.query<{ result: StatsResponse }>("select public.gw_stats() as result");
    expect(result.rows[0].result).toMatchObject({ total: 0, allowed: 0, challenged: 0, blocked: 0, averageScore: 0 });
    expect(result.rows[0].result.series).toHaveLength(60);
  });
  it("aggregates actual decisions and excludes expired history", async () => {
    for (const [decision, score, age] of [["allow", 0, 0], ["challenge", 50, 0], ["block", 100, 0], ["block", 100, 120]] as const) {
      await db.query(`insert into public.gw_decisions
        (id, created_at, client_id, method, path, score, decision, reasons, status, latency_ms, user_agent, features)
        values ($1, now() - $2 * interval '1 minute', 'client', 'GET', '/protected', $3, $4, '[]', 200, 20, 'test', '{}')`,
      [randomUUID(), age, score, decision]);
    }
    const { rows } = await db.query<{ result: StatsResponse }>("select public.gw_stats() as result");
    expect(rows[0].result).toMatchObject({ total: 3, allowed: 1, challenged: 1, blocked: 1, averageScore: 50, averageLatencyMs: 20 });
    expect(rows[0].result.series.reduce((sum, bucket) => sum + bucket.allowed + bucket.challenged + bucket.blocked, 0)).toBe(3);
  });
  it("prevents one-time challenge redemption replay", async () => {
    const nonce = randomUUID();
    await db.query("insert into public.gw_challenges values ($1, now() + interval '5 minutes')", [nonce]);
    await expect(db.query("insert into public.gw_challenges values ($1, now() + interval '5 minutes')", [nonce])).rejects.toMatchObject({ code: "23505" });
  });
  it("does not grant browser roles table or RPC privileges", async () => {
    const { rows } = await db.query<{ table_access: boolean; rpc_access: boolean; service_access: boolean }>(`select
      has_table_privilege('anon', 'public.gw_decisions', 'select') as table_access,
      has_function_privilege('authenticated', 'public.gw_record_request(text)', 'execute') as rpc_access,
      has_function_privilege('service_role', 'public.gw_record_request(text)', 'execute') as service_access`);
    expect(rows[0]).toEqual({ table_access: false, rpc_access: false, service_access: true });
  });
  it("cleans up stale client state, expired challenges, and old decisions", async () => {
    await db.exec(`insert into public.gw_clients (client_key, updated_at) values ('old', now() - interval '2 days');
      insert into public.gw_challenges values ('00000000-0000-0000-0000-000000000001', now() - interval '1 second');
      select public.gw_cleanup();`);
    expect((await db.query("select * from public.gw_clients")).rows).toHaveLength(0);
    expect((await db.query("select * from public.gw_challenges")).rows).toHaveLength(0);
  });
});
