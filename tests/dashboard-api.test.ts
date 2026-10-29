import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../components/sentinel/api";

afterEach(() => vi.unstubAllGlobals());

describe("dashboard API integration", () => {
  it("accepts a challenge decision even though its HTTP response is 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ score: 45, decision: "challenge", reasons: [] }, { status: 403 })));
    expect(await fetchJson("/protected", {}, true)).toMatchObject({ status: 403, body: { decision: "challenge" } });
  });
  it("distinguishes infrastructure errors from gateway decisions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Database unavailable", code: "STORAGE_UNAVAILABLE" }, { status: 503 })));
    await expect(fetchJson("/protected", {}, true)).rejects.toMatchObject({ status: 503, code: "STORAGE_UNAVAILABLE" });
  });
  it("rejects mismatched decision/status responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ score: 80, decision: "block", reasons: [] }, { status: 200 })));
    await expect(fetchJson("/protected", {}, true)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("preserves explicit cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn(async () => { throw controller.signal.reason; }));
    await expect(fetchJson("/api/stats", { signal: controller.signal })).rejects.toBe(controller.signal.reason);
  });
});
