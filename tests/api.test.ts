import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { GET as auth, POST as login, DELETE as logout } from "../app/api/auth/route";
import { GET as stats } from "../app/api/stats/route";
import { GET as decisions } from "../app/api/decisions/route";
import { POST as score } from "../app/api/score/route";
import { recordRequest } from "../lib/store";
import { signToken } from "../lib/security";

vi.mock("../lib/store", () => ({
  recordRequest: vi.fn(), getStats: vi.fn(async () => ({ total: 0 })),
  getDecisions: vi.fn(async () => ({ decisions: [], nextCursor: null })),
}));
const base = "http://localhost";
const post = (body: unknown) => new Request(`${base}/api/auth`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY", "false");
  vi.stubEnv("DASHBOARD_PASSWORD", "test-password");
  vi.stubEnv("GATEWAY_SECRET", "test-secret-must-be-at-least-32-characters");
  vi.mocked(recordRequest).mockResolvedValue({ requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("admin API", () => {
  it("reports authentication state and denies private telemetry", async () => {
    expect(await auth(new Request(base)).json()).toEqual({ authenticated: false, required: true });
    expect((await stats(new Request(`${base}/api/stats`))).status).toBe(401);
    expect((await decisions(new Request(`${base}/api/decisions`))).status).toBe(401);
  });
  it("logs in with an HttpOnly signed cookie and can sign out", async () => {
    expect((await login(post({ password: "wrong" }))).status).toBe(401);
    const response = await login(post({ password: "test-password" }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(await auth(new Request(base, { headers: { cookie } })).json()).toMatchObject({ authenticated: true });
    expect(logout(new Request(base, { method: "DELETE" })).headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("rate-limits login attempts", async () => {
    vi.mocked(recordRequest).mockResolvedValue({ requests10s: 11, requests60s: 11, intervalCount: 0, intervalCv: null });
    expect((await login(post({ password: "test-password" }))).status).toBe(429);
  });
  it("requires a password in production", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("DASHBOARD_PASSWORD", "");
    expect(auth(new Request(base)).status).toBe(503);
  });
  it("validates pagination parameters and supports authenticated requests", async () => {
    const cookie = `sentinel_admin=${signToken({ kind: "admin", exp: Date.now() + 60000 })}`;
    expect((await decisions(new Request(`${base}/api/decisions?limit=-1`, { headers: { cookie } }))).status).toBe(400);
    expect((await decisions(new Request(`${base}/api/decisions?decision=invalid`, { headers: { cookie } }))).status).toBe(400);
    expect((await decisions(new Request(`${base}/api/decisions`, { headers: { cookie } }))).status).toBe(200);
    expect((await stats(new Request(`${base}/api/stats`, { headers: { cookie } }))).status).toBe(200);
  });
  it("allows previews only to authorized callers and rejects invalid features", async () => {
    expect((await score(post({}))).status).toBe(401);
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    expect((await score(post({}))).status).toBe(400);
    const response = await score(post({ userAgent: "Mozilla/5.0", hasAccept: true, hasAcceptLanguage: true,
      requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null }));
    expect(await response.json()).toMatchObject({ score: 0, decision: "allow", preview: true });
  });
});
