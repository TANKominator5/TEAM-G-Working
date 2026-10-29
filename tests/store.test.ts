import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { consumeChallenge, getDecisions, recordRequest, saveDecision } from "../lib/store";
import type { DecisionRecord } from "../lib/contracts";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ.test.jwt");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Supabase REST adapter", () => {
  it("uses a server credential and validates atomic window responses", async () => {
    fetchMock.mockResolvedValue(Response.json({ requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null }));
    expect(await recordRequest("client")).toMatchObject({ requests10s: 1 });
    expect(fetchMock).toHaveBeenCalledWith("https://project.supabase.co/rest/v1/rpc/gw_record_request", expect.objectContaining({
      method: "POST", cache: "no-store", body: JSON.stringify({ p_client_key: "client" }),
      headers: expect.objectContaining({ apikey: "eyJ.test.jwt", Authorization: "Bearer eyJ.test.jwt" }),
    }));
    fetchMock.mockResolvedValue(Response.json({ incompatible: true }));
    await expect(recordRequest("client")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
  it("does not send a non-JWT secret as a bearer token", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_example");
    fetchMock.mockResolvedValue(Response.json({ requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null }));
    await recordRequest("client");
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.headers).not.toHaveProperty("Authorization");
  });
  it("reports missing config and upstream failures without falling back", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    await expect(recordRequest("client")).rejects.toMatchObject({ code: "SETUP_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    fetchMock.mockRejectedValue(new Error("network failure"));
    await expect(recordRequest("client")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
  it("maps conflict to challenge replay rejection", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 409 }));
    await expect(consumeChallenge("nonce", Date.now() + 10000)).rejects.toMatchObject({ code: "CHALLENGE_USED" });
  });
  it("writes decision records using the migration's column names", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    const record: DecisionRecord = {
      id: "00000000-0000-4000-8000-000000000001", timestamp: "2026-10-29T00:00:00Z", clientId: "abcdef",
      method: "GET", path: "/protected", score: 0, decision: "allow", reasons: [], status: 200,
      latencyMs: 10, userAgent: "browser", features: { userAgent: "browser", hasAccept: true,
        hasAcceptLanguage: true, requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null },
    };
    await saveDecision(record);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({ client_id: "abcdef", latency_ms: 10, created_at: record.timestamp });
  });
  it("returns stable composite cursors and validates them before querying", async () => {
    const rows = Array.from({ length: 2 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 1}`, created_at: "2026-10-29T00:00:00+00:00",
      client_id: "abc", method: "GET", path: "/protected", score: 0, decision: "allow",
      reasons: [], status: 200, latency_ms: 10, user_agent: "browser", features: {},
    }));
    fetchMock.mockImplementation(async () => Response.json(rows));
    const first = await getDecisions(1, "allow");
    expect(first.decisions).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    await getDecisions(1, "allow", first.nextCursor!);
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("or")).toContain("id.lt.00000000-0000-4000-8000-000000000001");
    await expect(getDecisions(1, undefined, "bad-cursor")).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
});
