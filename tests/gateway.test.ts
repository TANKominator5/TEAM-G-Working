import { createHash, randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { withGateway } from "../lib/gateway";
import { issueChallenge, solveChallenge, hasClearance } from "../lib/challenge";
import { clientKey, signToken } from "../lib/security";
import { DEMO_HEADER } from "../lib/contracts";
import * as store from "../lib/store";

vi.mock("../lib/store", () => ({ recordRequest: vi.fn(), saveDecision: vi.fn(), consumeChallenge: vi.fn(), observeSecurity: vi.fn() }));
const resource = vi.fn(async () => ({ message: "secret resource", items: [] }));
const gateway = withGateway(resource);
const normalWindow = { requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null };
const browser = () => new Request("http://localhost/protected", { headers: {
  "user-agent": "Mozilla/5.0", accept: "application/json", "accept-language": "en",
} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GATEWAY_SECRET", "test-secret-must-be-at-least-32-characters");
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY", "false");
  vi.stubEnv("DASHBOARD_PASSWORD", "required-password");
  vi.mocked(store.recordRequest).mockResolvedValue(normalWindow);
  vi.mocked(store.saveDecision).mockResolvedValue();
  vi.mocked(store.consumeChallenge).mockResolvedValue();
  vi.mocked(store.observeSecurity).mockResolvedValue({ fingerprintChanges: 0, honeypotHits: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("gateway middleware", () => {
  it("allows and persists real observed features before returning protected data", async () => {
    const response = await gateway(browser());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ decision: "allow", data: { message: "secret resource" } });
    expect(resource).toHaveBeenCalledOnce();
    expect(store.saveDecision).toHaveBeenCalledWith(expect.objectContaining({
      path: "/protected", status: 200, decision: "allow", features: expect.objectContaining({ userAgent: "Mozilla/5.0" }),
    }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("challenges suspicious requests without executing the resource", async () => {
    const response = await gateway(new Request("http://localhost/protected"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ decision: "challenge", challenge: { difficulty: 4, algorithm: "sha256" } });
    expect(resource).not.toHaveBeenCalled();
  });
  it("blocks rate abuse and returns Retry-After", async () => {
    vi.mocked(store.recordRequest).mockResolvedValue({ ...normalWindow, requests10s: 21, requests60s: 21 });
    const response = await gateway(browser());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(resource).not.toHaveBeenCalled();
  });
  it("fails closed on rate-store outages", async () => {
    const { ApiFailure } = await import("../lib/errors");
    vi.mocked(store.recordRequest).mockRejectedValue(new ApiFailure(503, "STORAGE_UNAVAILABLE", "Unavailable"));
    const response = await gateway(browser());
    expect(response.status).toBe(503);
    expect(resource).not.toHaveBeenCalled();
  });
  it("does not return protected data when decision persistence fails", async () => {
    const { ApiFailure } = await import("../lib/errors");
    vi.mocked(store.saveDecision).mockRejectedValue(new ApiFailure(503, "STORAGE_UNAVAILABLE", "Unavailable"));
    const response = await gateway(browser());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("data");
  });
  it("labels authenticated demo requests and charges the shared demo budget", async () => {
    const cookie = `sentinel_admin=${signToken({ kind: "admin", exp: Date.now() + 60000 })}`;
    const response = await gateway(new Request(browser(), { headers: {
      ...Object.fromEntries(browser().headers), cookie, [DEMO_HEADER]: randomUUID(),
    } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reasons).toContainEqual(expect.objectContaining({ code: "DEMO_TRAFFIC", weight: 0 }));
    expect(store.recordRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(store.recordRequest).mock.calls[0][0]).toMatch(/^demo_[a-f0-9]{64}$/);
  });
  it("bounds demo traffic without executing the protected resource", async () => {
    const cookie = `sentinel_admin=${signToken({ kind: "admin", exp: Date.now() + 60000 })}`;
    vi.mocked(store.recordRequest).mockResolvedValue({ ...normalWindow, requests10s: 101, requests60s: 101 });
    const response = await gateway(new Request(browser(), { headers: { cookie, [DEMO_HEADER]: randomUUID() } }));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "DEMO_BUDGET_LIMIT" });
    expect(resource).not.toHaveBeenCalled();
  });
  it("includes server-observed fingerprints and historical honeypot signals", async () => {
    vi.mocked(store.observeSecurity).mockResolvedValue({ fingerprintChanges: 3, honeypotHits: 1 });
    const response = await gateway(browser());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reasons: expect.arrayContaining([
      expect.objectContaining({ code: "FINGERPRINT_CHURN", weight: 15 }),
      expect.objectContaining({ code: "HONEYPOT_HIT", weight: 45 }),
    ]) });
    expect(store.saveDecision).toHaveBeenCalledWith(expect.objectContaining({ features: expect.objectContaining({ fingerprint: expect.stringMatching(/^[a-f0-9]{32}$/), honeypotHits: 1 }) }));
    expect(resource).not.toHaveBeenCalled();
  });
  it("never reveals a resource through the trap", async () => {
    vi.mocked(store.observeSecurity).mockResolvedValue({ fingerprintChanges: 0, honeypotHits: 1 });
    const trap = withGateway(resource, { honeypot: true });
    const response = await trap(browser());
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("data");
    expect(store.observeSecurity).toHaveBeenCalledWith(expect.any(String), expect.any(String), true);
    expect(resource).not.toHaveBeenCalled();
  });
  it("does not count cross-site trap loads or speculative prefetches", async () => {
    const trap = withGateway(resource, { honeypot: true });
    expect((await trap(new Request(browser(), { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect((await trap(new Request(browser(), { headers: { "sec-purpose": "prefetch" } }))).status).toBe(204);
    expect(store.observeSecurity).not.toHaveBeenCalled();
  });
});

describe("one-time proof-of-work clearance", () => {
  it("accepts a correct proof and binds clearance to client and user agent", async () => {
    const request = browser();
    const key = clientKey(request);
    const challenge = issueChallenge(request, key);
    let solution = 0;
    while (!createHash("sha256").update(`${challenge.token}:${solution}`).digest("hex").startsWith("0000")) solution++;
    const token = await solveChallenge(request, key, challenge.token, String(solution));
    expect(store.consumeChallenge).toHaveBeenCalledOnce();
    const cleared = new Request(request, { headers: { ...Object.fromEntries(request.headers), cookie: `sentinel_clearance=${token}` } });
    expect(hasClearance(cleared, key)).toBe(true);
    const otherAgent = new Request(request, { headers: { "user-agent": "other", cookie: `sentinel_clearance=${token}` } });
    expect(hasClearance(otherAgent, key)).toBe(false);
  });
  it("rejects tampering and incorrect proof before redemption", async () => {
    const request = browser(); const key = clientKey(request); const challenge = issueChallenge(request, key);
    await expect(solveChallenge(request, key, `${challenge.token}x`, "0")).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });
    await expect(solveChallenge(request, key, challenge.token, "not-a-number")).rejects.toMatchObject({ code: "INVALID_PROOF" });
    expect(store.consumeChallenge).not.toHaveBeenCalled();
  });
});
