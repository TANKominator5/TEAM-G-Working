import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientKey, cookie, requireSameOrigin, safeEqual, sessionCookie, signToken, verifyToken } from "../lib/security";
import { readJson } from "../lib/errors";

beforeEach(() => {
  vi.stubEnv("GATEWAY_SECRET", "test-secret-must-be-at-least-32-characters");
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("request and session security", () => {
  it("validates signed, typed, unexpired tokens", () => {
    const valid = signToken({ kind: "admin", exp: Date.now() + 60000 });
    expect(verifyToken(valid, "admin")).not.toBeNull();
    expect(verifyToken(`${valid}bad`, "admin")).toBeNull();
    expect(verifyToken(valid, "clearance")).toBeNull();
    expect(verifyToken(signToken({ kind: "admin", exp: Date.now() - 1 }), "admin")).toBeNull();
    expect(verifyToken(`${valid}.extra`, "admin")).toBeNull();
  });
  it("does not trust forwarded IPs in local mode", () => {
    const a = new Request("http://localhost/protected", { headers: { "x-forwarded-for": "1.2.3.4" } });
    const b = new Request("http://localhost/protected", { headers: { "x-forwarded-for": "5.6.7.8" } });
    expect(clientKey(a)).toBe(clientKey(b));
  });
  it("uses only Vercel's overwritten client-IP header on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    const request = new Request("https://example.com/protected", { headers: {
      "x-vercel-forwarded-for": "203.0.113.1", "x-forwarded-for": "198.51.100.1",
    } });
    const key = clientKey(request);
    expect(key).toHaveLength(64);
    expect(key).not.toContain("203.0.113");
    expect(() => clientKey(new Request("https://example.com/protected"))).toThrow("trusted client address");
  });
  it("requires an explicit trusted proxy outside Vercel production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => clientKey(new Request("https://example.com"))).toThrow("trusted IP-overwriting proxy");
  });
  it("blocks cross-origin mutations", () => {
    expect(() => requireSameOrigin(new Request("https://app.test/api/auth", { headers: { origin: "https://evil.test" } }))).toThrow();
    expect(() => requireSameOrigin(new Request("https://app.test/api/auth", { headers: { origin: "https://app.test" } }))).not.toThrow();
  });
  it("accepts the real destination when Next normalizes a local alias", () => {
    expect(() => requireSameOrigin(new Request("http://localhost:3001/api/auth", { headers: {
      host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001",
    } }))).not.toThrow();
  });
  it("does not treat another origin as an allowed hostname alias", () => {
    expect(() => requireSameOrigin(new Request("http://localhost:3001/api/auth", { headers: {
      host: "127.0.0.1:3001", origin: "http://localhost:3001",
    } }))).toThrow();
  });
  it("uses forwarded protocol only behind an explicitly trusted proxy", () => {
    const request = new Request("http://internal/api/auth", { headers: {
      host: "app.test", origin: "https://app.test", "x-forwarded-proto": "https",
    } });
    expect(() => requireSameOrigin(request)).toThrow();
    vi.stubEnv("TRUST_PROXY", "true");
    expect(() => requireSameOrigin(request)).not.toThrow();
  });
  it("never trusts a forwarded host to approve cross-origin requests", () => {
    vi.stubEnv("VERCEL", "1");
    expect(() => requireSameOrigin(new Request("https://app.test/api/auth", { headers: {
      host: "app.test", origin: "https://evil.test", "x-forwarded-host": "evil.test",
    } }))).toThrow();
  });
  it("rejects malformed origins, hosts, and cross-site fetches", () => {
    const cases: Record<string, string>[] = [
      { origin: "null" },
      { origin: "https://evil.test", host: "app.test@evil.test" },
      { origin: "https://app.test", "sec-fetch-site": "cross-site" },
    ];
    for (const headers of cases) {
      expect(() => requireSameOrigin(new Request("https://app.test/api/auth", { headers }))).toThrow();
    }
  });
  it("parses only the exact cookie name", () => {
    expect(cookie(new Request("https://app.test", { headers: { cookie: "not_admin=x; admin=y" } }), "admin")).toBe("y");
    expect(sessionCookie("admin", "x", 30)).toContain("HttpOnly; SameSite=Strict");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("a", "ab")).toBe(false);
  });
  it("rejects short signing secrets", () => {
    vi.stubEnv("GATEWAY_SECRET", "short");
    expect(() => signToken({})).toThrow("at least 32");
  });
});

describe("bounded JSON input", () => {
  it("rejects malformed JSON and unsupported content types", async () => {
    await expect(readJson(new Request("https://app.test", { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 415 });
    await expect(readJson(new Request("https://app.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
  });
  it("enforces size without relying on Content-Length", async () => {
    await expect(readJson(new Request("https://app.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify("a".repeat(9000)) }))).rejects.toMatchObject({ status: 413 });
  });
});
