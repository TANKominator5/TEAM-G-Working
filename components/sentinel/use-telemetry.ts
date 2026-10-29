"use client";

import { useEffect, useRef, useState } from "react";
import type { Decision, DecisionRecord, DecisionsResponse, StatsResponse } from "@/lib/contracts";
import { asError, DashboardError, fetchJson } from "./api";

export type DecisionFilter = "all" | Decision;
type State = {
  stats: StatsResponse | null;
  rows: DecisionRecord[];
  nextCursor: string | null;
  statsError: DashboardError | null;
  decisionsError: DashboardError | null;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  history: boolean;
  updatedAt: Date | null;
};
const initial: State = { stats: null, rows: [], nextCursor: null, statsError: null, decisionsError: null, loading: true, loadingMore: false, refreshing: false, history: false, updatedAt: null };

export function useTelemetry(enabled: boolean, filter: DecisionFilter, revision: number, onUnauthorized: () => void) {
  const [state, setState] = useState<State>(initial);
  const moreRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) { setState(initial); moreRef.current = () => {}; return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let busy = false;
    let history = false;
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    const { signal } = controller;
    setState(previous => ({ ...previous, rows: [], nextCursor: null, decisionsError: null, loading: true, loadingMore: false, history: false }));

    function url(next?: string) {
      const params = new URLSearchParams({ limit: "25" });
      if (filter !== "all") params.set("decision", filter);
      if (next) params.set("cursor", next);
      return `/api/decisions?${params}`;
    }
    function failure(error: unknown) {
      const parsed = asError(error);
      if (parsed.status === 401 && !signal.aborted) { controller.abort(); onUnauthorized(); }
      return parsed;
    }
    async function poll() {
      if (signal.aborted) return;
      if (busy) { timer = setTimeout(poll, 5_000); return; }
      busy = true;
      setState(previous => ({ ...previous, refreshing: true }));
      const [stats, decisions] = await Promise.allSettled([
        fetchJson<StatsResponse>("/api/stats", { signal }),
        history ? Promise.resolve(null) : fetchJson<DecisionsResponse>(url(), { signal }),
      ]);
      if (signal.aborted) return;
      const statsError = stats.status === "rejected" ? failure(stats.reason) : null;
      const decisionsError = decisions.status === "rejected" ? failure(decisions.reason) : null;
      if (signal.aborted) return;
      let rows: DecisionRecord[] | undefined;
      if (decisions.status === "fulfilled" && decisions.value) {
        const result = decisions.value.body;
        rows = [...new Map(result.decisions.map(row => [row.id, row])).values()];
        cursor = result.nextCursor;
      }
      setState(previous => ({
        ...previous,
        stats: stats.status === "fulfilled" ? stats.value.body : previous.stats,
        rows: rows ?? previous.rows,
        nextCursor: cursor,
        statsError,
        decisionsError: history ? previous.decisionsError : decisionsError,
        loading: false,
        refreshing: false,
        updatedAt: stats.status === "fulfilled" ? new Date() : previous.updatedAt,
      }));
      busy = false;
      timer = setTimeout(poll, 5_000);
    }
    moreRef.current = async () => {
      if (busy || !cursor || signal.aborted) return;
      busy = true;
      const requestedCursor = cursor;
      // Freeze first-page replacement before awaiting the older page.
      history = true;
      setState(previous => ({ ...previous, history: true, loadingMore: true, decisionsError: null }));
      try {
        const { body } = await fetchJson<DecisionsResponse>(url(requestedCursor), { signal });
        if (signal.aborted) return;
        seenCursors.add(requestedCursor);
        cursor = body.nextCursor && !seenCursors.has(body.nextCursor) ? body.nextCursor : null;
        setState(previous => ({ ...previous, rows: [...new Map([...previous.rows, ...body.decisions].map(row => [row.id, row])).values()], nextCursor: cursor }));
      } catch (error) {
        if (signal.aborted) return;
        const parsed = failure(error);
        if (!signal.aborted) setState(previous => ({ ...previous, decisionsError: parsed }));
      } finally {
        busy = false;
        if (!signal.aborted) setState(previous => ({ ...previous, loadingMore: false }));
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); moreRef.current = () => {}; };
  }, [enabled, filter, revision, onUnauthorized]);

  return { ...state, loadMore: () => moreRef.current() };
}
