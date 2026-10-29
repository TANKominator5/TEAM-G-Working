import { expect, test, type Page } from "@playwright/test";

// Browser-only fixtures; never used by the application or written to Supabase.
const timestamp = "2026-10-29T12:00:00Z";
const features = { userAgent: "Browser test fixture", hasAccept: true, hasAcceptLanguage: true, requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null };
const row = (index: number, decision = "allow") => ({
  id: `fixture-${index}`, timestamp, clientId: `test-client-${index}`, method: "GET", path: "/protected",
  score: decision === "allow" ? 0 : decision === "challenge" ? 45 : 80, decision,
  reasons: [{ code: "TEST_SIGNAL", message: "A test-only scoring explanation.", weight: 0 }],
  status: decision === "allow" ? 200 : decision === "challenge" ? 403 : 429,
  latencyMs: 15, userAgent: features.userAgent, features,
});
const stats = {
  windowMinutes: 60, total: 40, allowed: 20, challenged: 12, blocked: 8,
  averageScore: 32.5, averageLatencyMs: 15,
  series: Array.from({ length: 60 }, (_, index) => ({
    timestamp: new Date(Date.parse(timestamp) + index * 60000).toISOString(),
    allowed: index === 59 ? 20 : 0, challenged: index === 59 ? 12 : 0, blocked: index === 59 ? 8 : 0,
  })),
};

async function mockApi(page: Page, initiallyAuthenticated = true) {
  let authenticated = initiallyAuthenticated;
  const calls = { stats: 0, decisions: 0 };
  await page.route("**/api/auth", async route => {
    if (route.request().method() === "POST") authenticated = true;
    if (route.request().method() === "DELETE") authenticated = false;
    await route.fulfill({ json: { authenticated, required: true } });
  });
  await page.route("**/api/stats", async route => { calls.stats++; await route.fulfill({ json: stats }); });
  await page.route("**/api/analyses", route => route.fulfill({ json: { analyses: [], configured: false, model: "openai/gpt-oss-120b" } }));
  await page.route("**/api/decisions?*", async route => {
    calls.decisions++;
    const params = new URL(route.request().url()).searchParams;
    const decision = params.get("decision") ?? "allow";
    await route.fulfill({ json: params.has("cursor")
      ? { decisions: [row(2, decision)], nextCursor: null }
      : { decisions: [row(1, decision)], nextCursor: "fixture-cursor" } });
  });
  await page.route("**/protected", route => route.fulfill({ json: {
    score: 0, decision: "allow", reasons: row(1).reasons, requestId: "fixture-inspector",
    data: { message: "Browser fixture resource", items: [] },
  } }));
  return calls;
}

test("login, summary, details, protected inspector, and logout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await mockApi(page, false);
  await page.goto("/");
  await page.getByLabel("Dashboard password").fill("test-only-password");
  await page.getByRole("button", { name: /Sign in to console/ }).click();
  await expect(page.getByRole("heading", { name: "Security overview." })).toBeVisible();
  await expect(page.locator(".summary-card.total .summary-value")).toHaveText("40");
  await page.getByRole("button", { name: "Inspect request fixture-1" }).click();
  await expect(page.getByText("A test-only scoring explanation.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try protected API" }).click();
  await expect(page.locator(".resource-json")).toContainText("Browser fixture resource");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Dashboard password")).toBeVisible();
  expect(errors).toEqual([]);
});

test("pagination freezes the table while stats continue polling", async ({ page }) => {
  await page.clock.install();
  const calls = await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Load more" })).toBeEnabled();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Viewing older requests. Live table updates are paused.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect request fixture-2" })).toBeVisible();
  const previousStats = calls.stats;
  const previousDecisions = calls.decisions;
  await page.clock.runFor(5500);
  await expect.poll(() => calls.stats).toBeGreaterThan(previousStats);
  expect(calls.decisions).toBe(previousDecisions);
  await page.getByRole("button", { name: "Return to live" }).click();
  await expect(page.getByRole("button", { name: "Inspect request fixture-2" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load more" })).toBeEnabled();
});

test("decision filters load the correct feed", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Inspect request fixture-1" })).toBeVisible();
  await page.getByRole("group", { name: "Filter decisions" }).getByRole("button", { name: "Blocked", exact: true }).click();
  await expect(page.locator(".decisions-table .decision-badge")).toHaveText("Blocked");
});

test("a setup failure is not presented as live or empty successful telemetry", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/stats", route => route.fulfill({ status: 503, json: { error: "Configure request storage.", code: "SETUP_REQUIRED" } }));
  await page.route("**/api/decisions?*", route => route.fulfill({ status: 503, json: { error: "Configure request storage.", code: "SETUP_REQUIRED" } }));
  await page.goto("/");
  await expect(page.locator(".error-notice")).toContainText("Gateway setup required");
  await expect(page.getByText("Decision feed unavailable", { exact: true })).toBeVisible();
  await expect(page.locator(".summary-card.total .summary-value")).toHaveText("—");
  await expect(page.getByText("Live connection", { exact: true })).toHaveCount(0);
});

test("expired telemetry sessions return the user to sign-in", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/stats", route => route.fulfill({ status: 401, json: { error: "Session expired.", code: "UNAUTHORIZED" } }));
  await page.goto("/");
  await expect(page.getByLabel("Dashboard password")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security overview." })).toHaveCount(0);
});

test("mobile dashboard fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Inspect request fixture-1" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("AI setup is explicit and never fabricates a finding", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText(/AI setup required: add/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze traffic", exact: true })).toBeDisabled();
  await expect(page.getByText(/No saved AI findings yet/)).toBeVisible();
});

test("AI findings are displayed as advisory evidence, not enforced actions", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/analyses", route => route.fulfill({ json: { analyses: [], configured: true, model: "openai/gpt-oss-120b" } }));
  await page.route("**/api/analyze", route => route.fulfill({ json: { cached: false, analysis: {
    id: "fixture-analysis", createdAt: timestamp, model: "openai/gpt-oss-120b", inputHash: "test-hash",
    sampleSize: 10, windowTotal: 40, windowStart: timestamp, windowEnd: timestamp,
    finding: { classification: "likely_automation", risk: "high", summary: "A test-only burst pattern was observed.",
      evidence: ["Ten sampled requests arrived in one second."], recommendedAction: "challenge",
      recommendations: ["Review shared-IP false positives."], limitations: "Small samples do not prove malicious activity." },
  } } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Analyze traffic", exact: true }).click();
  await expect(page.getByText("A test-only burst pattern was observed.", { exact: true })).toBeVisible();
  await expect(page.getByText(/AI does not change gateway decisions/)).toBeVisible();
  await expect(page.getByRole("button", { name: /12:00 · high/ })).toBeVisible();
});

test("guided demo is bounded and gives each scenario a fresh run identity", async ({ page }) => {
  await mockApi(page);
  const counts = new Map<string, number>();
  await page.route("**/protected", async route => {
    const request = route.request();
    const runId = request.headers()["x-sentinel-demo-run"];
    expect(runId).toMatch(/^[a-f0-9-]{36}$/);
    const count = (counts.get(runId) ?? 0) + 1; counts.set(runId, count);
    const suspicious = request.headers()["accept"] === "";
    const decision = count > 20 ? "block" : suspicious && count > 5 ? "challenge" : "allow";
    await route.fulfill({ status: decision === "allow" ? 200 : decision === "challenge" ? 403 : 429,
      json: { score: decision === "allow" ? 0 : decision === "challenge" ? 45 : 80,
        decision, reasons: [], requestId: `demo-${count}`,
        ...(decision === "challenge" ? { challenge: { token: "test-only-token", difficulty: 4,
          expiresAt: new Date(Date.now() + 60000).toISOString(), algorithm: "sha256" } } : {}),
      } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "1. Normal visitor", exact: true }).click();
  await expect(page.getByLabel("Demo result")).toContainText("1 allowed");
  await page.getByRole("button", { name: "2. Suspicious client", exact: true }).click();
  await expect(page.getByRole("link", { name: "Complete browser challenge" })).toBeVisible();
  await page.getByRole("button", { name: "3. Burst traffic", exact: true }).click();
  await expect(page.getByLabel("Demo result")).toContainText("24 requests completed");
  await expect(page.getByLabel("Demo result")).toContainText("4 blocked");
  expect([...counts.values()]).toEqual([1, 6, 24]);
});

test("challenge navigation verifies the issued token rather than replacing it", async ({ page }) => {
  await mockApi(page);
  let verified = false;
  const token = "original-browser-fixture-challenge";
  await page.route("**/protected", route => route.fulfill(verified ? {
    json: { score: 0, decision: "allow", reasons: [], requestId: "cleared" },
  } : { status: 403, json: {
    score: 45, decision: "challenge", reasons: [], requestId: "challenged",
    challenge: { token, difficulty: 1, expiresAt: new Date(Date.now() + 60000).toISOString(), algorithm: "sha256" },
  } }));
  await page.route("**/api/challenge/verify", async route => {
    expect(route.request().postDataJSON().token).toBe(token);
    verified = true;
    await route.fulfill({ json: { verified: true, expiresIn: 900 } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try protected API", exact: true }).click();
  await page.getByRole("link", { name: "Continue to challenge" }).click();
  await page.getByRole("button", { name: "Verify browser", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("The protected API returned HTTP 200");
  expect(verified).toBe(true);
});
