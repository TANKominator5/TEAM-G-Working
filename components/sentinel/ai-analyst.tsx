"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisHistoryResponse, AnalysisRecord, AnalyzeResponse } from "@/lib/contracts";
import { asError, DashboardError, fetchJson } from "./api";
import { Icon } from "./icons";
import { time } from "./traffic-chart";

export function AiAnalyst({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [history, setHistory] = useState<AnalysisHistoryResponse | null>(null);
  const [error, setError] = useState<DashboardError | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  const [selected, setSelected] = useState<AnalysisRecord | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void fetchJson<AnalysisHistoryResponse>("/api/analyses", { signal: controller.signal }).then(({ body }) => {
      if (!controller.signal.aborted) { setHistory(body); setSelected(body.analyses[0] ?? null); }
    }).catch(error => {
      if (!controller.signal.aborted) {
        const parsed = asError(error); setError(parsed);
        if (parsed.status === 401) onUnauthorized();
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); if (request.current === controller) request.current = null; });
    return () => { controller.abort(); request.current?.abort(); };
  }, [onUnauthorized]);

  async function analyze() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(null); setCached(false);
    try {
      const { body } = await fetchJson<AnalyzeResponse>("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal,
      }, false, 45_000);
      if (controller.signal.aborted) return;
      setSelected(body.analysis); setCached(body.cached);
      setHistory(previous => ({
        configured: true, model: body.analysis.model,
        analyses: [body.analysis, ...(previous?.analyses ?? []).filter(item => item.id !== body.analysis.id)].slice(0, 5),
      }));
    } catch (error) {
      if (!controller.signal.aborted) {
        const parsed = asError(error); setError(parsed);
        if (parsed.status === 401) onUnauthorized();
      }
    } finally { if (!controller.signal.aborted) setBusy(false); if (request.current === controller) request.current = null; }
  }

  return <section className="panel mt-6" id="analysis" aria-labelledby="analysis-title" aria-busy={loading || busy}>
    <div className="panel-heading flex-wrap pb-5">
      <div><div className="eyebrow mb-2">OPEN-WEIGHT AI / GROQ</div><h2 id="analysis-title">AI traffic analyst</h2><p>Pattern analysis grounded in observed traffic. Recommendations, not automatic enforcement.</p></div>
      <button className="button button-primary" disabled={loading || busy || history?.configured === false} onClick={analyze}>
        {busy ? <><Icon name="refresh" size={15} className="spin" />Analyzing…</> : <>Analyze traffic <Icon name="arrow" size={15} /></>}
      </button>
    </div>
    <div className="border-t border-slate-700/60 px-6 py-5">
      {loading && <p className="text-sm text-slate-400" role="status">Loading saved findings…</p>}
      {history && !history.configured && <p className="mb-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-6 text-amber-200">AI setup required: add <code>GROQ_API_KEY</code> to the server environment and restart/redeploy. Gateway protection remains active.</p>}
      {error && <div className="mb-4 rounded-lg border border-red-300/20 bg-red-300/5 p-3 text-xs text-red-200" role="alert"><strong>AI analysis unavailable</strong><p className="mt-2">{error.message}</p><code className="mt-2 block">{error.code}</code></div>}
      {!loading && !selected && <p className="text-sm leading-6 text-slate-400">No saved AI findings yet. Generate traffic with the protected API, then analyze its recent patterns.</p>}
      {selected && <>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className={`rounded border px-2 py-1 ${selected.finding.risk === "high" ? "border-rose-400/30 text-rose-300" : selected.finding.risk === "medium" ? "border-amber-300/30 text-amber-200" : "border-emerald-400/30 text-emerald-300"}`}>{selected.finding.risk.toUpperCase()} RISK</span>
          <span>{selected.finding.classification.replaceAll("_", " ")}</span><span>{time(selected.createdAt)} UTC</span>{cached && <span>Reused matching snapshot</span>}
        </div>
        <p className="max-w-4xl text-sm leading-7 text-slate-200">{selected.finding.summary}</p>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div><h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-300">Supporting evidence</h3><ul className="space-y-2 text-xs leading-6 text-slate-400">{selected.finding.evidence.map((item, index) => <li key={index}>• {item}</li>)}</ul></div>
          <div><h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-300">Suggested response: {selected.finding.recommendedAction}</h3><ul className="space-y-2 text-xs leading-6 text-slate-400">{selected.finding.recommendations.map((item, index) => <li key={index}>• {item}</li>)}</ul></div>
        </div>
        <p className="mt-5 rounded-lg bg-slate-950/40 p-3 text-xs leading-6 text-slate-400"><strong className="text-slate-300">Limits: </strong>{selected.finding.limitations}</p>
        <p className="mt-3 break-all text-xs leading-6 text-slate-500">Model: {selected.model} · {selected.sampleSize} sampled / {selected.windowTotal} requests in window · AI does not change gateway decisions.</p>
      </>}
      {!!history?.analyses.length && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-700/60 pt-4"><span className="mr-1 text-xs text-slate-500">Saved analyses</span>{history.analyses.map(item => <button key={item.id} className="button button-quiet button-small" aria-pressed={selected?.id === item.id} onClick={() => { setSelected(item); setCached(false); }}>{time(item.createdAt)} · {item.finding.risk}</button>)}</div>}
      <p className="mt-4 text-xs leading-6 text-slate-500">Only anonymized numeric summaries and known signal codes are sent to Groq. No raw IPs, user-agent strings, cookies, or secrets. Two new analyses/minute maximum.</p>
    </div>
  </section>;
}
