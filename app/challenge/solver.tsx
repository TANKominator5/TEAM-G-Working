"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_HEADER, type GatewayResponse } from "@/lib/contracts";
import { forgetChallenge, pendingChallenge } from "@/components/sentinel/pending-challenge";

export default function ChallengeClient() {
  const [status, setStatus] = useState("Ready to verify your browser.");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setReady(true); return () => controller.current?.abort(); }, []);

  async function verify() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      setStatus("Checking gateway…");
      const pending = pendingChallenge();
      let challenge = pending?.challenge;
      const demoHeaders: Record<string, string> = pending?.demoRunId ? { [DEMO_HEADER]: pending.demoRunId } : {};
      if (!challenge) {
        const response = await fetch("/protected", { cache: "no-store", signal: abort.signal });
        const result = await response.json() as GatewayResponse & { error?: string };
        if (response.status === 200 && result.decision === "allow") {
          setStatus("Your browser is already allowed. Return to the dashboard.");
          return;
        }
        if (!result.challenge) throw new Error(result.error ?? (result.decision === "block" ? "Rate limit reached. Wait 60 seconds, then retry." : "No challenge is available."));
        challenge = result.challenge;
      }
      const { token, difficulty, expiresAt } = challenge;
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) throw new Error("Invalid challenge difficulty.");
      setStatus("Computing a small proof of work…");
      const encoder = new TextEncoder();
      let solution: string | undefined;
      for (let attempt = 0; attempt < 2_000_000; attempt++) {
        if (abort.signal.aborted) return;
        if (attempt % 1000 === 0 && Date.now() > Date.parse(expiresAt)) throw new Error("Challenge expired. Please retry.");
        const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${token}:${attempt}`)));
        if (Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").startsWith("0".repeat(difficulty))) {
          solution = String(attempt); break;
        }
        if (attempt % 2000 === 0) setStatus(`Computing proof… ${attempt.toLocaleString()} attempts`);
      }
      if (solution === undefined) throw new Error("Proof budget exhausted. Please retry.");
      const verified = await fetch("/api/challenge/verify", {
        method: "POST", headers: { "Content-Type": "application/json", ...demoHeaders },
        body: JSON.stringify({ token, solution }), signal: abort.signal,
      });
      const body = await verified.json();
      if (!verified.ok) throw new Error(body.error ?? "Verification failed.");
      forgetChallenge();
      const retry = await fetch("/protected", { cache: "no-store", signal: abort.signal, headers: {
        ...demoHeaders, ...(pending?.demoRunId ? { Accept: "", "Accept-Language": "" } : {}),
      } });
      const retried = await retry.json() as GatewayResponse & { error?: string };
      setStatus(retry.status === 200
        ? "Verified. The protected API returned HTTP 200. Your clearance lasts 15 minutes; excessive traffic is still blocked."
        : `Challenge verified. The protected API returned HTTP ${retry.status}: ${retried.error ?? retried.decision}. Clearance does not bypass hard limits.`);
    } catch (error) {
      if (!abort.signal.aborted) setStatus(error instanceof Error ? error.message : "Verification failed.");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }

  return <main className="mx-auto max-w-xl p-8 pt-24">
    <p className="text-sm tracking-widest text-emerald-400">SENTINEL / BROWSER CHECK</p>
    <h1 className="mt-4 text-4xl font-bold">One quick verification</h1>
    <p className="mt-4 text-slate-400">This proof adds a small computational cost to automation. It is not proof that a visitor is human.</p>
    <p className="my-8 rounded-xl border border-slate-700 bg-slate-900 p-5" role="status" aria-live="polite">{status}</p>
    <button className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50" onClick={verify} disabled={busy || !ready}>
      {!ready ? "Loading browser check…" : busy ? "Verifying…" : "Verify browser"}
    </button>
    <a href="/" className="ml-5 text-emerald-400 underline">Back to dashboard</a>
  </main>;
}
