"use client";

import { useEffect, useRef, useState } from "react";
import type { GatewayResponse } from "@/lib/contracts";
import { asError, DashboardError, errorTitle, fetchJson } from "./api";
import { DecisionBadge, Reasons } from "./decisions";
import { Icon } from "./icons";
import { rememberChallenge } from "./pending-challenge";

export function ProtectedInspector({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [result, setResult] = useState<{ body: GatewayResponse; status: number } | null>(null);
  const [error, setError] = useState<DashboardError | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function inspect() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(null); setResult(null);
    try {
      const response = await fetchJson<GatewayResponse>("/protected", { signal: controller.signal }, true);
      if (!controller.signal.aborted) {
        if (response.body.challenge) rememberChallenge(response.body.challenge);
        setResult(response);
      }
    }
    catch (error) {
      if (controller.signal.aborted) return;
      const parsed = asError(error);
      setError(parsed);
      if (parsed.status === 401) onUnauthorized();
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); }
    }
  }
  return <section className="panel inspector-panel" id="inspector" aria-labelledby="inspector-title">
    <div className="inspector-intro"><div className="terminal-icon"><Icon name="terminal" size={24} /></div><div><div className="eyebrow">REQUEST INSPECTOR</div><h2 id="inspector-title">Meet your first line of defense.</h2><p>Send one request to the protected resource and see exactly how Sentinel evaluates it.</p></div></div>
    <div className="inspector-action"><code><span>GET</span> /protected</code><button type="button" className="button button-primary" onClick={inspect} disabled={pending}>{pending ? <><Icon name="refresh" size={16} className="spin" /> Evaluating request…</> : <>Try protected API <Icon name="arrow" size={16} /></>}</button></div>
    <div aria-live="polite" aria-atomic="true">
      {error && <div className="inspector-error" role="alert"><strong>{errorTitle(error)}</strong><p>{error.message}</p><code>{error.status ? `HTTP ${error.status} · ` : ""}{error.code}</code><p>This infrastructure error is not a gateway decision.</p></div>}
      {result && <div className="inspector-result"><div className="result-heading"><span className="http-result">HTTP {result.status}</span><DecisionBadge decision={result.body.decision} /><span>Risk score <strong>{result.body.score} / 100</strong></span></div><div className="result-columns"><div><h3>Scoring reasons</h3><Reasons reasons={result.body.reasons} /><p className="detail-id">Request ID <code>{result.body.requestId}</code></p></div><div>
        {result.body.decision === "allow" && <><h3>Allowed resource JSON</h3><pre className="resource-json">{JSON.stringify(result.body.data ?? null, null, 2)}</pre></>}
        {result.body.decision === "challenge" && <div className="challenge-next"><h3>Verification required</h3><p>Complete the gateway challenge to continue.</p>{result.body.challenge && <p className="muted">Difficulty {result.body.challenge.difficulty} · expires {new Date(result.body.challenge.expiresAt).toLocaleTimeString()}</p>}<a className="button button-quiet" href="/challenge?returnTo=/">Continue to challenge <Icon name="arrow" size={15} /></a></div>}
        {result.body.decision === "block" && <div className="challenge-next"><h3>Request blocked</h3><p>The gateway declined this request.{result.body.retryAfter ? ` Retry after ${result.body.retryAfter} seconds.` : " Wait before trying again."}</p></div>}
      </div></div></div>}
    </div>
  </section>;
}
