"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { StatsResponse } from "@/lib/contracts";
import { asError, DashboardError, errorTitle, fetchJson } from "./api";
import { Decisions } from "./decisions";
import { Icon, type IconName } from "./icons";
import { ProtectedInspector } from "./protected-inspector";
import { number, time, TrafficChart } from "./traffic-chart";
import { useTelemetry, type DecisionFilter } from "./use-telemetry";
import { AiAnalyst } from "./ai-analyst";

type Auth = { status: "checking" | "ready" | "signed-out" | "error"; required: boolean };
type AuthResponse = { authenticated: boolean; required?: boolean };

function ErrorNotice({ error, label }: { error: DashboardError; label?: string }) {
  return <div className="error-notice" role="alert"><Icon name="info" size={18} /><div><strong>{errorTitle(error)}{label ? ` · ${label}` : ""}</strong><p>{error.message}</p><code>{error.status ? `HTTP ${error.status} · ` : ""}{error.code}</code></div></div>;
}

function SummaryCards({ stats, loading, stale }: { stats: StatsResponse | null; loading: boolean; stale: boolean }) {
  const cards: { label: string; field: "total" | "allowed" | "challenged" | "blocked"; icon: IconName; tone: string; note: string }[] = [
    { label: "Total requests", field: "total", icon: "activity", tone: "total", note: "Across all decisions" },
    { label: "Allowed", field: "allowed", icon: "check", tone: "allow", note: "Passed through the gateway" },
    { label: "Challenged", field: "challenged", icon: "challenge", tone: "challenge", note: "Additional verification" },
    { label: "Blocked", field: "blocked", icon: "block", tone: "block", note: "Stopped at the gateway" },
  ];
  return <div className={`summary-grid ${stale ? "is-stale" : ""}`} aria-label="Requests in the last 60 minutes" aria-busy={loading}>{cards.map(card => <article className={`summary-card ${card.tone}`} key={card.field}><div className="summary-label"><span>{card.label}</span><span className={`summary-icon ${card.tone}`}><Icon name={card.icon} size={18} /></span></div><div className="summary-value">{loading && !stats ? <span className="skeleton metric-skeleton" /> : stats ? number(stats[card.field]) : "—"}{stats && card.field !== "total" && <span className={`percentage ${card.tone}`}>{stats.total ? (stats[card.field] / stats.total * 100).toFixed(1) : "0"}%</span>}</div><p>{stats ? stale ? "Last received · updates interrupted" : card.note : loading ? "Loading gateway telemetry" : "Waiting for gateway telemetry"}</p></article>)}</div>;
}

export function SentinelDashboard() {
  const [auth, setAuth] = useState<Auth>({ status: "checking", required: true });
  const [authRevision, setAuthRevision] = useState(0);
  const [authError, setAuthError] = useState<DashboardError | null>(null);
  const [authBusy, setAuthBusy] = useState<"login" | "logout" | null>(null);
  const [password, setPassword] = useState("");
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [revision, setRevision] = useState(0);
  const authRequest = useRef<AbortController | null>(null);
  const onUnauthorized = useCallback(() => {
    setAuth({ status: "signed-out", required: true });
    setAuthError(new DashboardError("Your session has expired. Sign in again to view gateway telemetry.", 401, "UNAUTHORIZED"));
    setPassword("");
  }, []);
  const telemetry = useTelemetry(auth.status === "ready", filter, revision, onUnauthorized);

  useEffect(() => {
    const controller = new AbortController();
    authRequest.current = controller;
    setAuth(previous => ({ ...previous, status: "checking" }));
    setAuthError(null);
    void fetchJson<AuthResponse>("/api/auth", { signal: controller.signal }).then(({ body }) => {
      if (!controller.signal.aborted) setAuth({ status: body.authenticated ? "ready" : "signed-out", required: body.required !== false });
    }).catch(error => {
      if (controller.signal.aborted) return;
      const parsed = asError(error);
      setAuthError(parsed);
      setAuth({ status: parsed.status === 401 ? "signed-out" : "error", required: true });
    }).finally(() => { if (authRequest.current === controller) authRequest.current = null; });
    return () => { controller.abort(); authRequest.current?.abort(); };
  }, [authRevision]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRequest.current || !password) return;
    const controller = new AbortController();
    authRequest.current = controller;
    const submittedPassword = password;
    setPassword(""); setAuthBusy("login"); setAuthError(null);
    try {
      const { body } = await fetchJson<AuthResponse>("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: submittedPassword }), signal: controller.signal });
      if (!controller.signal.aborted) {
        if (!body.authenticated) throw new DashboardError("The server did not establish a session. Please try again.", 401, "UNAUTHORIZED");
        setAuth({ status: "ready", required: true });
      }
    } catch (error) { if (!controller.signal.aborted) setAuthError(asError(error)); }
    finally { if (!controller.signal.aborted) setAuthBusy(null); if (authRequest.current === controller) authRequest.current = null; }
  }

  async function logout() {
    if (authRequest.current) return;
    const controller = new AbortController();
    authRequest.current = controller;
    setAuthBusy("logout"); setAuthError(null); setPassword("");
    setAuth(previous => ({ ...previous, status: "checking" }));
    try {
      await fetchJson<AuthResponse>("/api/auth", { method: "DELETE", signal: controller.signal });
      if (!controller.signal.aborted) setAuth(previous => ({ ...previous, status: "signed-out" }));
    } catch (error) {
      if (!controller.signal.aborted) { setAuthError(asError(error)); setAuth(previous => ({ ...previous, status: "error" })); }
    } finally { if (!controller.signal.aborted) setAuthBusy(null); if (authRequest.current === controller) authRequest.current = null; }
  }

  const refresh = () => setRevision(value => value + 1);
  const feedError = telemetry.statsError ?? telemetry.decisionsError;
  const connected = auth.status === "ready" && !!telemetry.stats && !feedError;
  const connecting = auth.status === "checking" || (auth.status === "ready" && telemetry.loading);
  const connectionText = connected ? "Live connection" : connecting ? "Connecting" : auth.status === "signed-out" ? "Signed out" : "Connection unavailable";

  return <div className="sentinel-app">
    <a className="skip-link" href="#main-content">Skip to dashboard</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/" aria-label="Sentinel home"><span className="brand-icon"><Icon name="shield" size={26} /></span><span>sentinel<span className="brand-period">.</span></span><span className="brand-divider" /><span className="brand-caption">BOT DETECTION GATEWAY</span></a><div className="header-actions"><span className={`connection-badge ${connected ? "connected" : connecting ? "connecting" : "disconnected"}`} role="status"><i className="dot" />{connectionText}</span><span className="header-divider" /><button className="button button-quiet header-refresh" aria-label="Refresh dashboard" onClick={auth.status === "ready" ? refresh : () => setAuthRevision(value => value + 1)} disabled={connecting || telemetry.refreshing || !!authBusy}><Icon name="refresh" size={16} className={telemetry.refreshing ? "spin" : ""} /><span>Refresh</span></button>{auth.status === "ready" && <button className="button button-ghost signout" aria-label="Sign out" onClick={logout}><Icon name="logout" size={16} /><span>Sign out</span></button>}</div></div></header>
    <div className="workspace-bar"><div className="workspace-inner"><nav aria-label="Dashboard sections"><a className="workspace-tab current" href="#main-content"><Icon name="layers" size={15} />Overview</a>{auth.status === "ready" && <><a className="workspace-tab" href="#decisions">Decisions</a><a className="workspace-tab" href="#inspector">Request inspector</a></>}</nav><span className="team-label"><span className="team-avatar">G</span>TEAM G<span className="workspace-env">GATEWAY CONSOLE</span></span></div></div>
    <main id="main-content" className="main-content">
      {auth.status !== "ready" ? <section className="auth-layout" aria-labelledby="auth-title"><div className="auth-story"><span className="eyebrow">VISIBILITY. WITHOUT THE GUESSWORK.</span><h1>Your traffic.<br />A clearer picture.</h1><p>Understand every request with real-time visibility and explainable bot detection.</p><div className="auth-signal"><Icon name="shield" size={20} /><span>Observe. Evaluate. Protect.</span></div></div><div className="panel auth-card"><span className="auth-lock"><Icon name="lock" size={22} /></span><h2 id="auth-title">{auth.status === "checking" ? authBusy === "logout" ? "Signing out" : "Connecting to Sentinel" : auth.status === "error" ? "Connection needs attention" : auth.required ? "Welcome to Sentinel" : "You’re signed out"}</h2><p>{auth.status === "checking" ? "Checking your gateway session…" : auth.required ? "Sign in to your gateway console." : "Authentication is disabled in this environment. Your session cookie has been cleared."}</p>{authError && <ErrorNotice error={authError} />}{auth.status === "signed-out" && auth.required && <form onSubmit={login}><label htmlFor="dashboard-password">Dashboard password</label><input id="dashboard-password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={256} required disabled={authBusy === "login"} aria-describedby="password-note" autoFocus /><button className="button button-primary" disabled={authBusy === "login" || !password}>{authBusy === "login" ? <><Icon name="refresh" size={16} className="spin" />Signing in…</> : <>Sign in to console <Icon name="arrow" size={16} /></>}</button><p id="password-note" className="password-note"><Icon name="lock" size={12} />Your session uses an HttpOnly cookie.</p></form>}{(auth.status === "error" || (auth.status === "signed-out" && !auth.required)) && <button className="button button-primary" onClick={() => setAuthRevision(value => value + 1)}><Icon name="refresh" size={16} />{auth.required ? "Retry connection" : "Open dashboard"}</button>}{auth.status === "checking" && <span className="auth-loading"><Icon name="refresh" size={22} className="spin" /></span>}</div></section> : <>
        <div className="page-intro"><div><div className="eyebrow"><span className="tiny-line" /> GATEWAY INTELLIGENCE</div><h1>Security overview<span className="heading-dot">.</span></h1><p>A clear view of the traffic at your door.</p></div><div className="window-label"><Icon name="clock" size={16} /><div><strong>Last 60 minutes</strong><span>{telemetry.updatedAt ? `Updated ${time(telemetry.updatedAt)} UTC${feedError ? " · stale" : ""}` : "Waiting for first update"}</span></div></div></div>
        {telemetry.statsError && <ErrorNotice error={telemetry.statsError} label="Traffic stats" />}
        {telemetry.decisionsError && (!telemetry.statsError || telemetry.statsError.code !== telemetry.decisionsError.code) && <ErrorNotice error={telemetry.decisionsError} label="Decision feed" />}
        <SummaryCards stats={telemetry.stats} loading={telemetry.loading} stale={!!telemetry.statsError} />
        <TrafficChart stats={telemetry.stats} loading={telemetry.loading} stale={!!telemetry.statsError} />
        <AiAnalyst onUnauthorized={onUnauthorized} />
        <div className="feed-heading"><span><i className={`dot ${feedError ? "disconnected" : telemetry.history ? "challenge" : "allow"}`} />{feedError ? "Feed interrupted · retrying automatically" : telemetry.history ? "History view · stats continue updating" : "Auto-refreshes every 5 seconds"}</span><span>Explainable by design</span></div>
        <Decisions key={`${filter}-${revision}`} rows={telemetry.rows} filter={filter} onFilter={setFilter} loading={telemetry.loading} loadingMore={telemetry.loadingMore} refreshing={telemetry.refreshing} nextCursor={telemetry.nextCursor} history={telemetry.history} loadMore={telemetry.loadMore} refresh={refresh} unavailable={!!telemetry.decisionsError} />
        <ProtectedInspector onUnauthorized={onUnauthorized} />
        <div className="heuristics-note"><Icon name="info" size={16} /><p><strong>Signals, not certainty.</strong> Heuristics help identify unusual request patterns. A score or decision is not proof of bot activity.</p></div>
      </>}
    </main>
    <footer className="site-footer"><span><Icon name="shield" size={15} /><strong>sentinel.</strong><span className="footer-divider">/</span>Explainable request protection</span><span>Built by Team G <span className="footer-dot">·</span> Hack4Haldia ’26</span></footer>
  </div>;
}
