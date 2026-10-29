import type { ApiError, GatewayResponse } from "@/lib/contracts";

export class DashboardError extends Error {
  constructor(message: string, public status = 0, public code = "NETWORK_ERROR") { super(message); }
}

export function asError(error: unknown): DashboardError {
  return error instanceof DashboardError ? error : new DashboardError("The gateway could not be reached. Check your connection and try again.");
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, gateway = false): Promise<{ body: T; status: number }> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new DashboardError("The gateway could not be reached or the request timed out. Try again shortly.");
  }
  let body: T & Partial<ApiError>;
  try { body = await response.json(); }
  catch { throw new DashboardError(`The server returned an unreadable response (HTTP ${response.status}).`, response.status, "INVALID_RESPONSE"); }
  if (!body || typeof body !== "object") throw new DashboardError("The server returned an invalid response.", response.status, "INVALID_RESPONSE");
  // A gateway decision can use a non-2xx status. An API error is never a decision.
  if (typeof body.error === "string") throw new DashboardError(body.error, response.status, typeof body.code === "string" ? body.code : "API_ERROR");
  if (gateway) {
    const result = body as unknown as GatewayResponse;
    const expected = { allow: 200, challenge: 403, block: 429 };
    if (!(result.decision in expected) || expected[result.decision] !== response.status || !Number.isFinite(result.score) || !Array.isArray(result.reasons)) {
      throw new DashboardError(`The protected API returned an unexpected response (HTTP ${response.status}).`, response.status, "INVALID_RESPONSE");
    }
  } else if (!response.ok) {
    throw new DashboardError(`The request failed (HTTP ${response.status}).`, response.status, "API_ERROR");
  }
  return { body, status: response.status };
}

export function errorTitle(error: DashboardError): string {
  if (error.status === 401) return "Sign-in required";
  if (error.code === "SETUP_REQUIRED") return "Gateway setup required";
  if (error.status === 503) return "Request storage unavailable";
  if (error.status === 0) return "Connection interrupted";
  return "Unable to complete request";
}
