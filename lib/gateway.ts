import { randomUUID } from "node:crypto";
import type { DecisionRecord, GatewayResponse, RequestFeatures } from "./contracts";
import { issueChallenge, hasClearance } from "./challenge";
import { requestIdentity } from "./request-identity";
import { scoreRequest } from "./scoring";
import { observeSecurity, recordRequest, saveDecision } from "./store";
import { ApiFailure, errorResponse } from "./errors";
import { requestFingerprint } from "./fingerprint";
import { requireSameOrigin } from "./security";

/** Application-layer middleware: wrap each resource that requires protection. */
export function withGateway(resource: () => Promise<NonNullable<GatewayResponse["data"]>>, options: { honeypot?: boolean } = {}) {
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    try {
      if (options.honeypot) {
        requireSameOrigin(request);
        // Don't penalize speculative browser prefetches or link previews.
        if (/prefetch|prerender/i.test(`${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`)) {
          return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
        }
      }
      const { key, realKey, isDemo } = requestIdentity(request);
      if (isDemo) {
        const budget = await recordRequest(`demo_${realKey}`);
        if (budget.requests60s > 100) throw new ApiFailure(429, "DEMO_BUDGET_LIMIT", "Demo traffic is limited to 100 requests per minute. Wait before running another scenario.");
      }
      const fingerprint = requestFingerprint(request);
      const [window, signals] = await Promise.all([recordRequest(key), observeSecurity(key, fingerprint, options.honeypot)]);
      const features: RequestFeatures = {
        userAgent: (request.headers.get("user-agent") ?? "").slice(0, 512),
        hasAccept: Boolean(request.headers.get("accept")?.trim()),
        hasAcceptLanguage: Boolean(request.headers.get("accept-language")?.trim()),
        ...window,
        ...signals,
        fingerprint,
      };
      const result = scoreRequest(features, !options.honeypot && hasClearance(request, key));
      if (isDemo) result.reasons.push({ code: "DEMO_TRAFFIC", message: "Operator-initiated demo traffic with an isolated rate window. This is not an observed real-world attack.", weight: 0 });
      const status = result.decision === "allow" ? 200 : result.decision === "challenge" ? 403 : 429;
      const id = randomUUID();
      const body: GatewayResponse = { ...result, requestId: id };
      if (result.decision === "allow" && !options.honeypot) body.data = await resource();
      else if (result.decision === "challenge") body.challenge = issueChallenge(request, key);
      else body.retryAfter = 60;
      const record: DecisionRecord = {
        ...result, id, timestamp: new Date().toISOString(), clientId: key.slice(0, 16),
        method: request.method, path: new URL(request.url).pathname.slice(0, 256), status,
        latencyMs: Math.round(performance.now() - started), userAgent: features.userAgent, features,
      };
      // Await persistence before responding; never rely on serverless fire-and-forget writes.
      await saveDecision(record);
      return Response.json(body, { status, headers: {
        "Cache-Control": "no-store", "X-Request-Id": id, "X-Gateway-Decision": result.decision,
        ...(options.honeypot ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
        "X-Gateway-Score": String(result.score), ...(status === 429 ? { "Retry-After": "60" } : {}),
      } });
    } catch (error) { return errorResponse(error); }
  };
}
