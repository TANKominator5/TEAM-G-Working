"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_HEADER, type GatewayResponse } from "@/lib/contracts";
import { asError, DashboardError, fetchJson } from "./api";
import { Icon } from "./icons";
import { rememberChallenge } from "./pending-challenge";

type Scenario = "normal" | "challenge" | "burst";
type Result = { scenario: Scenario; total: number; allowed: number; challenged: number; blocked: number };
export function DemoControls({ onComplete, onUnauthorized }: { onComplete: () => void; onUnauthorized: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<DashboardError | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function run(scenario: Scenario) {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(null); setResult(null);
    const runId = crypto.randomUUID();
    const total = scenario === "normal" ? 1 : scenario === "challenge" ? 6 : 24;
    const concurrency = scenario === "burst" ? 24 : 8;
    const counts: Result = { scenario, total: 0, allowed: 0, challenged: 0, blocked: 0 };
    let proofSaved = false;
    try {
      for (let offset = 0; offset < total; offset += concurrency) {
        setProgress(`Sending ${Math.min(offset + concurrency, total)} / ${total} real requests…`);
        const responses = await Promise.allSettled(Array.from({ length: Math.min(concurrency, total - offset) }, () =>
          fetchJson<GatewayResponse>("/protected", { signal: abort.signal, headers: {
            [DEMO_HEADER]: runId,
            ...(scenario === "challenge" ? { Accept: "", "Accept-Language": "" } : {}),
          } }, true)));
        if (abort.signal.aborted) return;
        let failure: unknown;
        for (const response of responses) {
          if (response.status === "rejected") { failure ??= response.reason; continue; }
          const body = response.value.body;
          counts.total++;
          if (body.decision === "allow") counts.allowed++;
          else if (body.decision === "challenge") counts.challenged++;
          else counts.blocked++;
          if (scenario === "challenge" && body.challenge) { rememberChallenge(body.challenge, runId); proofSaved = true; }
        }
        setResult({ ...counts });
        if (failure) throw failure;
      }
      setProgress(proofSaved ? "Challenge issued. Follow the verification link below." : "Scenario complete. Its decisions are visible in the live feed.");
    } catch (error) {
      if (!abort.signal.aborted) { const parsed = asError(error); setError(parsed); if (parsed.status === 401) onUnauthorized(); }
    } finally {
      if (!abort.signal.aborted) { setBusy(false); onComplete(); }
      if (controller.current === abort) controller.current = null;
    }
  }

  return <section className="panel mb-6" id="demo" aria-labelledby="demo-title" aria-busy={busy}>
    <div className="panel-heading flex-wrap pb-5"><div><div className="eyebrow mb-2">GUIDED LIVE DEMO</div><h2 id="demo-title">Watch the gateway make a decision</h2><p>Real protected requests, real database logs. No pre-baked scores.</p></div><span className="subtle-tag">Operator-only · isolated demo clients</span></div>
    <div className="border-t border-slate-700/60 px-6 py-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <button className="button button-quiet" disabled={busy} onClick={() => run("normal")}><Icon name="check" size={15} />1. Normal visitor</button>
        <button className="button button-quiet" disabled={busy} onClick={() => run("challenge")}><Icon name="challenge" size={15} />2. Suspicious client</button>
        <button className="button button-quiet" disabled={busy} onClick={() => run("burst")}><Icon name="block" size={15} />3. Burst traffic</button>
      </div>
      <p className="mt-4 text-xs leading-6 text-slate-400">Normal: 1 request. Suspicious: 6 requests with missing Accept/Accept-Language headers. Burst: 24 concurrent requests, with no repeat loop. Each scenario gets a fresh, authenticated demo identity; ordinary visitor rate budgets are unchanged.</p>
      {progress && <p className="mt-3 text-xs text-slate-300" role="status">{progress}</p>}
      {result && <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-slate-950/40 p-4 text-xs" aria-label="Demo result"><span>{result.total} requests completed</span><span className="text-emerald-300">{result.allowed} allowed</span><span className="text-amber-200">{result.challenged} challenged</span><span className="text-rose-300">{result.blocked} blocked</span>{!busy && result.scenario === "challenge" && result.challenged > 0 && <a className="button button-quiet button-small" href="/challenge">Complete browser challenge <Icon name="arrow" size={13} /></a>}</div>}
      {error && <div className="mt-4 text-xs leading-6 text-red-200" role="alert"><strong>Demo interrupted</strong><p>{error.message}</p><code>{error.code}</code></div>}
      <p className="mt-4 text-xs leading-6 text-slate-500">Demo requests are explicitly labeled, capped at 100/minute per operator IP, and included in AI summaries as simulations—not claimed as real attacks.</p>
    </div>
  </section>;
}
