import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { requestFingerprint } from "../lib/fingerprint";
import { scoreRequest } from "../lib/scoring";
import type { RequestFeatures } from "../lib/contracts";

beforeEach(() => vi.stubEnv("GATEWAY_SECRET", "test-secret-must-be-at-least-32-characters"));
afterEach(() => vi.unstubAllEnvs());
const normal: RequestFeatures = { userAgent: "Mozilla/5.0", hasAccept: true, hasAcceptLanguage: true,
  requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null };

describe("passive request fingerprinting", () => {
  it("is stable, normalized, bounded, and keyed", () => {
    const a = new Request("https://app.test/protected", { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US,  en" } });
    const b = new Request("https://app.test/other", { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US, en" } });
    expect(requestFingerprint(a)).toMatch(/^[a-f0-9]{32}$/);
    expect(requestFingerprint(a)).toBe(requestFingerprint(b));
    const original = requestFingerprint(a);
    vi.stubEnv("GATEWAY_SECRET", "different-secret-must-be-at-least-32-characters");
    expect(requestFingerprint(a)).not.toBe(original);
  });
  it("ignores secrets, IPs, paths, and Accept but changes with browser signals", () => {
    const a = new Request("https://app.test", { headers: { "user-agent": "Mozilla/5.0" } });
    const b = new Request("https://app.test/secret", { headers: { "user-agent": "Mozilla/5.0", cookie: "secret", authorization: "Bearer secret", "x-forwarded-for": "203.0.113.1", accept: "application/json" } });
    const changed = new Request(a, { headers: { "user-agent": "different-agent" } });
    expect(requestFingerprint(a)).toBe(requestFingerprint(b));
    expect(requestFingerprint(a)).not.toBe(requestFingerprint(changed));
  });
});

describe("bonus security scoring", () => {
  it("does not block fingerprint changes on their own", () => {
    expect(scoreRequest({ ...normal, fingerprintChanges: 3 })).toMatchObject({ score: 15, decision: "allow" });
  });
  it("challenges first honeypot history and blocks repeated hits", () => {
    expect(scoreRequest({ ...normal, honeypotHits: 1 })).toMatchObject({ score: 45, decision: "challenge" });
    expect(scoreRequest({ ...normal, honeypotHits: 2 }, true)).toMatchObject({ score: 80, decision: "block" });
  });
});
