"use client";

import { Fragment, useState } from "react";
import type { Decision, DecisionRecord, Reason } from "@/lib/contracts";
import { Icon } from "./icons";
import { number } from "./traffic-chart";
import type { DecisionFilter } from "./use-telemetry";

export function DecisionBadge({ decision }: { decision: Decision }) {
  return <span className={`decision-badge ${decision}`}><i className="dot" />{decision === "allow" ? "Allowed" : decision === "challenge" ? "Challenged" : "Blocked"}</span>;
}

export function Reasons({ reasons }: { reasons: Reason[] }) {
  return reasons.length ? <ul className="reason-list">{reasons.map((reason, index) => <li key={`${reason.code}-${index}`}><div><code>{reason.code}</code><p>{reason.message}</p></div><span className={`reason-weight ${reason.weight > 0 ? "positive" : ""}`}>{reason.weight > 0 ? "+" : ""}{reason.weight}</span></li>)}</ul> : <p className="muted">No scoring reasons returned for this request.</p>;
}

function RequestDetails({ row }: { row: DecisionRecord }) {
  const features = row.features;
  return <div className="request-details">
    <div><h3>Scoring reasons</h3><Reasons reasons={row.reasons} /><p className="detail-id">Request ID <code>{row.id}</code></p></div>
    <div><h3>Observed request features</h3><dl className="features">
      <div><dt>Accept header</dt><dd>{features.hasAccept ? "Present" : "Missing"}</dd></div>
      <div><dt>Accept-Language</dt><dd>{features.hasAcceptLanguage ? "Present" : "Missing"}</dd></div>
      <div><dt>Requests / 10 seconds</dt><dd>{features.requests10s}</dd></div>
      <div><dt>Requests / 60 seconds</dt><dd>{features.requests60s}</dd></div>
      <div><dt>Observed intervals</dt><dd>{features.intervalCount}</dd></div>
      <div><dt>Interval variation (CV)</dt><dd>{features.intervalCv === null ? "Insufficient samples" : features.intervalCv.toFixed(3)}</dd></div>
      <div><dt>Request latency</dt><dd>{row.latencyMs.toFixed(1)} ms</dd></div>
      <div className="feature-wide"><dt>User agent</dt><dd>{features.userAgent || row.userAgent || "Not provided"}</dd></div>
      <div className="feature-wide"><dt>Anonymized client</dt><dd>{row.clientId}</dd></div>
      <div className="feature-wide"><dt>Timestamp</dt><dd>{row.timestamp}</dd></div>
    </dl></div>
  </div>;
}

export function Decisions({ rows, filter, onFilter, loading, loadingMore, refreshing, nextCursor, history, loadMore, refresh, unavailable }: {
  rows: DecisionRecord[]; filter: DecisionFilter; onFilter: (value: DecisionFilter) => void;
  loading: boolean; loadingMore: boolean; refreshing: boolean; nextCursor: string | null;
  history: boolean; loadMore: () => void; refresh: () => void; unavailable: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <section className="panel decisions-panel" id="decisions" aria-labelledby="decisions-title" aria-busy={loading}>
    <div className="panel-heading decisions-heading"><div><div className="title-with-count"><h2 id="decisions-title">Recent decisions</h2><span className="count-pill">{number(rows.length)}</span></div><p>Inspect a request to understand the decision.</p></div>
      <div className="decision-filters" role="group" aria-label="Filter decisions">{(["all", "allow", "challenge", "block"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => { setExpanded(null); onFilter(value); }}>{value === "all" ? "All decisions" : value === "allow" ? "Allowed" : value === "challenge" ? "Challenged" : "Blocked"}</button>)}</div>
    </div>
    {history && <div className="history-notice"><Icon name="clock" size={15} /><span>Viewing older requests. Live table updates are paused.</span><button onClick={refresh}>Return to live <Icon name="arrow" size={13} /></button></div>}
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Recent decisions, scroll horizontally on small screens">
      <table className="decisions-table"><thead><tr><th scope="col">Time <span>UTC</span></th><th scope="col">Client</th><th scope="col">Request</th><th scope="col">Risk score</th><th scope="col">Decision</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Inspect request</span></th></tr></thead><tbody>
        {loading ? Array.from({ length: 5 }, (_, index) => <tr key={index} className="skeleton-row"><td colSpan={7}><span className="skeleton" /><span className="sr-only">Loading requests</span></td></tr>) : rows.map(row => <Fragment key={row.id}>
          <tr className={expanded === row.id ? "expanded-row" : ""}>
            <td><time dateTime={row.timestamp} title={row.timestamp}>{new Date(row.timestamp).toLocaleTimeString("en-GB", { timeZone: "UTC" })}</time></td>
            <td><span className="client-hash" title={row.clientId}>{row.clientId.length > 14 ? `${row.clientId.slice(0, 12)}…` : row.clientId}</span></td>
            <td><div className="request-path"><span className="method">{row.method}</span><code title={row.path}>{row.path}</code></div></td>
            <td><div className="score-cell"><span className={`score-number ${row.decision}`}>{row.score}</span><span className="score-track"><span className={row.decision} style={{ width: `${Math.min(100, Math.max(0, row.score))}%` }} /></span></div></td>
            <td><DecisionBadge decision={row.decision} /></td><td><span className={`http-status ${row.status >= 400 ? "http-error" : ""}`}>{row.status}</span></td>
            <td><button className="inspect-button" aria-label={`${expanded === row.id ? "Collapse" : "Inspect"} request ${row.id}`} aria-expanded={expanded === row.id} aria-controls={`request-${row.id}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)}><Icon name="chevron" size={15} /></button></td>
          </tr>
          {expanded === row.id && <tr className="detail-row" id={`request-${row.id}`}><td colSpan={7}><RequestDetails row={row} /></td></tr>}
        </Fragment>)}
      </tbody></table>
    </div>
    {!loading && rows.length === 0 && <div className="table-empty"><span className="empty-icon"><Icon name={unavailable ? "layers" : "shield"} size={25} /></span><h3>{unavailable ? "Decision feed unavailable" : filter === "all" ? "Your watch starts here" : `No ${filter === "allow" ? "allowed" : filter === "challenge" ? "challenged" : "blocked"} requests`}</h3><p>{unavailable ? "Reconnect to the API to view request decisions." : "Requests appear here as they pass through the gateway."}</p></div>}
    <div className="table-footer"><span>{loading ? "Retrieving decisions…" : `${number(rows.length)} requests loaded`}{!loading && !nextCursor && rows.length > 0 ? " · End of results" : ""}</span><button className="button button-quiet button-small" onClick={loadMore} disabled={!nextCursor || loading || loadingMore || refreshing}>{loadingMore ? <><Icon name="refresh" size={14} className="spin" /> Loading…</> : <>Load more <Icon name="chevron" size={12} style={{ transform: "rotate(90deg)" }} /></>}</button></div>
  </section>;
}
