import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { requestIdentity } from "../lib/request-identity";
import { DEMO_HEADER } from "../lib/contracts";
import { signToken } from "../lib/security";
import { forgetChallenge, pendingChallenge, rememberChallenge } from "../components/sentinel/pending-challenge";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", ""); vi.stubEnv("TRUST_PROXY", "false");
  vi.stubEnv("DASHBOARD_PASSWORD", "required-password");
  vi.stubEnv("GATEWAY_SECRET", "test-secret-must-be-at-least-32-characters");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("operator-only isolated demonstration identities", () => {
  it("never lets public callers rotate a real visitor's rate window", () => {
    const plain = requestIdentity(new Request("http://localhost/protected"));
    for (let attempt = 0; attempt < 3; attempt++) {
      const forged = requestIdentity(new Request("http://localhost/protected", { headers: { [DEMO_HEADER]: randomUUID() } }));
      expect(forged).toEqual(plain);
      expect(forged.isDemo).toBe(false);
    }
  });
  it("requires an authentic operator cookie and a valid UUID", () => {
    const cookie = `sentinel_admin=${signToken({ kind: "admin", exp: Date.now() + 60000 })}`;
    const real = requestIdentity(new Request("http://localhost/protected", { headers: { cookie } }));
    const first = requestIdentity(new Request("http://localhost/protected", { headers: { cookie, [DEMO_HEADER]: randomUUID() } }));
    const second = requestIdentity(new Request("http://localhost/protected", { headers: { cookie, [DEMO_HEADER]: randomUUID() } }));
    expect(first.isDemo).toBe(true);
    expect(first.realKey).toBe(real.key);
    expect(first.key).not.toBe(real.key);
    expect(first.key).not.toBe(second.key);
    expect(requestIdentity(new Request("http://localhost/protected", { headers: { cookie, [DEMO_HEADER]: "invalid" } }))).toEqual(real);
  });
  it("does not accept a forged admin signature", () => {
    const identity = requestIdentity(new Request("http://localhost/protected", { headers: {
      cookie: "sentinel_admin=forged.cookie", [DEMO_HEADER]: randomUUID(),
    } }));
    expect(identity.isDemo).toBe(false);
  });
});

describe("preserving an issued browser challenge across navigation", () => {
  it("stores only a bounded challenge and optional demo context, then clears it", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { setItem: (key: string, value: string) => storage.set(key, value),
      getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key) });
    const challenge = { token: "signed-test-challenge", difficulty: 4, expiresAt: new Date(Date.now() + 60000).toISOString(), algorithm: "sha256" as const };
    const runId = randomUUID();
    rememberChallenge(challenge, runId);
    expect(pendingChallenge()).toEqual({ challenge, demoRunId: runId });
    rememberChallenge({ ...challenge, expiresAt: new Date(Date.now() - 1).toISOString() });
    expect(pendingChallenge()).toBeNull();
    rememberChallenge(challenge, "invalid-demo-id");
    expect(pendingChallenge()).toBeNull();
    forgetChallenge(); expect(storage.size).toBe(0);
  });
  it("fails gracefully when browser storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(() => rememberChallenge({ token: "token", difficulty: 4, expiresAt: "x", algorithm: "sha256" })).not.toThrow();
    expect(pendingChallenge()).toBeNull();
    expect(() => forgetChallenge()).not.toThrow();
  });
});
