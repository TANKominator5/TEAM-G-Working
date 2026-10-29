import { z } from "zod";
import type { AnalysisRecord, Decision, DecisionRecord, DecisionsResponse, StatsResponse } from "./contracts";
import { ApiFailure } from "./errors";

function databaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiFailure(503, "SETUP_REQUIRED", "Configure Supabase and apply the supplied SQL migration.");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && parsed.hostname === "localhost")) throw new Error();
    return { url: parsed.origin, key };
  } catch { throw new ApiFailure(503, "SETUP_REQUIRED", "SUPABASE_URL must be a valid HTTPS project URL."); }
}

async function database(path: string, init: RequestInit = {}): Promise<unknown> {
  const { url, key } = databaseConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init, cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: {
        apikey: key,
        ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
        "Content-Type": "application/json", ...init.headers,
      },
    });
  } catch { throw new ApiFailure(503, "STORAGE_UNAVAILABLE", "The request store could not be reached. Try again shortly."); }
  if (!response.ok) {
    // Do not log response bodies: upstream errors may include sensitive request data.
    console.error("Supabase request failed", response.status, path.split("?")[0]);
    if (response.status === 409 && path === "gw_challenges") {
      throw new ApiFailure(400, "CHALLENGE_USED", "This challenge has already been used.");
    }
    throw new ApiFailure(503, "STORAGE_UNAVAILABLE", "The request store is unavailable. Check credentials and migration.");
  }
  if (response.status === 204) return null;
  let text: string;
  try { text = await response.text(); }
  catch { throw new ApiFailure(503, "STORAGE_UNAVAILABLE", "The request store response was interrupted."); }
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new ApiFailure(503, "STORAGE_UNAVAILABLE", "The request store returned an invalid response."); }
}

const windowSchema = z.object({
  requests10s: z.number().int().nonnegative(), requests60s: z.number().int().nonnegative(),
  intervalCount: z.number().int().nonnegative(), intervalCv: z.number().nullable(),
});
export type RequestWindow = z.infer<typeof windowSchema>;

export async function recordRequest(key: string): Promise<RequestWindow> {
  const data = await database("rpc/gw_record_request", { method: "POST", body: JSON.stringify({ p_client_key: key }) });
  const parsed = windowSchema.safeParse(data);
  if (!parsed.success) throw new ApiFailure(503, "STORAGE_UNAVAILABLE", "The request-window migration is missing or incompatible.");
  return parsed.data;
}

export async function saveDecision(record: DecisionRecord): Promise<void> {
  await database("gw_decisions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    id: record.id, created_at: record.timestamp, client_id: record.clientId,
    method: record.method, path: record.path, score: record.score, decision: record.decision,
    reasons: record.reasons, status: record.status, latency_ms: record.latencyMs,
    user_agent: record.userAgent, features: record.features,
  }) });
}

export async function consumeChallenge(nonce: string, expiresAt: number): Promise<void> {
  await database("gw_challenges", { method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ nonce, expires_at: new Date(expiresAt).toISOString() }),
  });
}

interface DatabaseDecision {
  id: string; created_at: string; client_id: string; method: string; path: string;
  score: number; decision: Decision; reasons: DecisionRecord["reasons"]; status: number;
  latency_ms: number; user_agent: string; features: DecisionRecord["features"];
}
function toDecision(row: DatabaseDecision): DecisionRecord {
  return {
    id: row.id, timestamp: row.created_at, clientId: row.client_id,
    method: row.method, path: row.path, score: row.score, decision: row.decision,
    reasons: row.reasons, status: row.status, latencyMs: row.latency_ms,
    userAgent: row.user_agent, features: row.features,
  };
}

const cursorSchema = z.object({ timestamp: z.iso.datetime({ offset: true }), id: z.uuid() });
export async function getDecisions(limit: number, decision?: Decision, cursor?: string): Promise<DecisionsResponse> {
  const params = new URLSearchParams({ select: "*", order: "created_at.desc,id.desc", limit: String(limit + 1) });
  if (decision) params.set("decision", `eq.${decision}`);
  if (cursor) {
    let value: z.infer<typeof cursorSchema>;
    try {
      if (cursor.length > 512) throw new Error();
      value = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    } catch { throw new ApiFailure(400, "INVALID_CURSOR", "The pagination cursor is invalid."); }
    params.set("or", `(created_at.lt.${value.timestamp},and(created_at.eq.${value.timestamp},id.lt.${value.id}))`);
  }
  const data = await database(`gw_decisions?${params}`) as DatabaseDecision[];
  const hasMore = data.length > limit;
  const decisions = data.slice(0, limit).map(toDecision);
  const last = decisions.at(-1);
  return { decisions, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ timestamp: last.timestamp, id: last.id })).toString("base64url") : null };
}

export async function getStats(): Promise<StatsResponse> {
  // Aggregate in Postgres, not a capped PostgREST result set.
  return await database("rpc/gw_stats", { method: "POST", body: "{}" }) as StatsResponse;
}

interface DatabaseAnalysis {
  id: string; created_at: string; model: string; input_hash: string;
  sample_size: number; window_total: number; window_start: string; window_end: string;
  finding: AnalysisRecord["finding"];
}
function toAnalysis(row: DatabaseAnalysis): AnalysisRecord {
  return { id: row.id, createdAt: row.created_at, model: row.model, inputHash: row.input_hash,
    sampleSize: row.sample_size, windowTotal: row.window_total, windowStart: row.window_start,
    windowEnd: row.window_end, finding: row.finding };
}
export async function getAnalyses(): Promise<AnalysisRecord[]> {
  const params = new URLSearchParams({ select: "*", order: "created_at.desc,id.desc", limit: "5" });
  const data = await database(`gw_analyses?${params}`) as DatabaseAnalysis[];
  return data.map(toAnalysis);
}
export async function getCachedAnalysis(hash: string): Promise<AnalysisRecord | null> {
  const params = new URLSearchParams({ select: "*", input_hash: `eq.${hash}`,
    created_at: `gte.${new Date(Date.now() - 5 * 60000).toISOString()}`, order: "created_at.desc,id.desc", limit: "1" });
  const data = await database(`gw_analyses?${params}`) as DatabaseAnalysis[];
  return data[0] ? toAnalysis(data[0]) : null;
}
export async function saveAnalysis(analysis: AnalysisRecord): Promise<void> {
  await database("gw_analyses", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    id: analysis.id, created_at: analysis.createdAt, model: analysis.model, input_hash: analysis.inputHash,
    sample_size: analysis.sampleSize, window_total: analysis.windowTotal, window_start: analysis.windowStart,
    window_end: analysis.windowEnd, finding: analysis.finding,
  }) });
}
