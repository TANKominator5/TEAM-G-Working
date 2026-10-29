"use client";

import { useId, useState } from "react";
import type { StatsResponse } from "@/lib/contracts";
import { Icon } from "./icons";

export const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
export const time = (value: string | Date) => new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function TrafficChart({ stats, loading, stale }: { stats: StatsResponse | null; loading: boolean; stale: boolean }) {
  const id = useId().replace(/:/g, "");
  const [selected, setSelected] = useState<number | null>(null);
  const series = stats?.series ?? [];
  const width = 800, height = 210, left = 40, right = 12, top = 12, bottom = 26;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maximum = Math.max(4, ...series.flatMap(bucket => [bucket.allowed, bucket.challenged, bucket.blocked]));
  const ceiling = Math.ceil(maximum / 4) * 4;
  const x = (index: number) => left + index / Math.max(1, series.length - 1) * plotWidth;
  const y = (value: number) => top + (1 - value / ceiling) * plotHeight;
  const active = selected === null ? null : Math.min(selected, series.length - 1);
  const bucket = active === null ? null : series[active];
  const hasTraffic = series.some(bucket => bucket.allowed + bucket.challenged + bucket.blocked > 0);
  const keys = ["allowed", "challenged", "blocked"] as const;
  const colors = { allowed: "#45d6ab", challenged: "#e7b768", blocked: "#f07c89" };

  return <section className="panel traffic-panel" aria-labelledby="traffic-title" aria-busy={loading}>
    <div className="panel-heading">
      <div><h2 id="traffic-title">Traffic overview</h2><p>Every request. Every decision.</p></div>
      <span className="subtle-tag"><Icon name="clock" size={13} /> Last {stats?.windowMinutes ?? 60} minutes</span>
    </div>
    <div className="chart-legend"><span><i className="dot allow" />Allowed</span><span><i className="dot challenge" />Challenged</span><span><i className="dot block" />Blocked</span><span className="chart-unit">Requests / minute · UTC</span></div>
    {loading && !stats ? <div className="chart-placeholder skeleton" role="status"><span className="sr-only">Loading traffic history</span></div> : !stats ? <div className="chart-placeholder chart-empty"><Icon name="activity" size={30} /><strong>Waiting for telemetry</strong><span>Traffic appears when the stats API is available.</span></div> : <>
      <div className={`chart-wrap ${stale ? "is-stale" : ""}`}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`} onPointerLeave={() => setSelected(null)} onPointerMove={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setSelected(Math.max(0, Math.min(series.length - 1, Math.round(((event.clientX - bounds.left) / bounds.width * width - left) / plotWidth * (series.length - 1)))));
        }}>
          <title id={`${id}-title`}>Gateway decisions per minute</title><desc id={`${id}-desc`}>{stats.total} requests in the last {stats.windowMinutes} minutes: {stats.allowed} allowed, {stats.challenged} challenged, {stats.blocked} blocked. All timestamps use UTC.</desc>
          <defs>{keys.map(key => <linearGradient key={key} id={`${id}-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[key]} stopOpacity=".17" /><stop offset="100%" stopColor={colors[key]} stopOpacity="0" /></linearGradient>)}</defs>
          {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1={left} x2={width - right} y1={y(ceiling * index / 4)} y2={y(ceiling * index / 4)} stroke="#243040" strokeDasharray="3 5" /><text x={left - 12} y={y(ceiling * index / 4) + 4} textAnchor="end" className="chart-label">{number(ceiling * index / 4)}</text></g>)}
          {keys.map(key => {
            if (!series.length) return null;
            const path = series.map((bucket, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(bucket[key]).toFixed(1)}`).join(" ");
            return <g key={key}><path d={`${path} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-${key})`} /><path d={path} stroke={colors[key]} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" /></g>;
          })}
          {series.filter((_, index) => [0, 1, 2, 3, 4].some(tick => index === Math.round(tick * (series.length - 1) / 4))).map(bucket => {
            const index = series.indexOf(bucket);
            return <text key={bucket.timestamp} x={x(index)} y={height - 4} textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"} className="chart-label">{time(bucket.timestamp)}</text>;
          })}
          {active !== null && bucket && <g><line x1={x(active)} x2={x(active)} y1={top} y2={y(0)} stroke="#7b93a8" strokeDasharray="3 4" />{keys.map(key => <circle key={key} cx={x(active)} cy={y(bucket[key])} r="4" fill={colors[key]} stroke="#111b28" strokeWidth="2" />)}</g>}
        </svg>
        {!hasTraffic && <div className="zero-traffic">No requests in this window</div>}
      </div>
      {series.length > 1 && <input className="chart-scrubber" type="range" min="0" max={series.length - 1} value={active ?? series.length - 1} aria-label="Inspect traffic minute" aria-valuetext={bucket ? `${time(bucket.timestamp)} UTC: ${bucket.allowed} allowed, ${bucket.challenged} challenged, ${bucket.blocked} blocked` : "Select a minute to inspect"} onChange={event => setSelected(Number(event.target.value))} />}
      <div className="chart-caption">{bucket ? <span><b>{time(bucket.timestamp)} UTC</b> · {bucket.allowed} allowed · {bucket.challenged} challenged · {bucket.blocked} blocked</span> : <span>Minute buckets from the gateway stats API</span>}<span>{stale ? "Last received data" : "Drag or hover to inspect"}</span></div>
    </>}
    <div className="chart-metrics"><div><span>Average risk score</span><strong>{stats && stats.total > 0 ? stats.averageScore.toFixed(1) : "—"}<small> / 100</small></strong></div><div><span>Average latency</span><strong>{stats && stats.total > 0 ? stats.averageLatencyMs.toFixed(1) : "—"}<small> ms</small></strong></div><div className="metric-note"><Icon name="layers" size={18} /><span>Minute-level signals.<br />Explainable decisions.</span></div></div>
  </section>;
}
