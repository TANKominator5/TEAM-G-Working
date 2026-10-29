import { randomUUID } from "node:crypto";
import type { DecisionRecord, GatewayResponse, RequestFeatures } from "./contracts";
import { issueChallenge, hasClearance } from "./challenge";
import { clientKey } from "./security";
import { scoreRequest } from "./scoring";
import { recordRequest, saveDecision } from "./store";
import { errorResponse } from "./errors";

/** Application-layer middleware: wrap each resource that requires protection. */
export function withGateway(resource: () => Promise<NonNullable<GatewayResponse["data"]>>) {
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    try {
      const key = clientKey(request);
      const window = await recordRequest(key);
      const features: RequestFeatures = {
        userAgent: (request.headers.get("user-agent") ?? "").slice(0, 512),
        hasAccept: Boolean(request.headers.get("accept")?.trim()),
        hasAcceptLanguage: Boolean(request.headers.get("accept-language")?.trim()),
        ...window,
      };
      const result = scoreRequest(features, hasClearance(request, key));
      const status = result.decision === "allow" ? 200 : result.decision === "challenge" ? 403 : 429;
      const id = randomUUID();
      const body: GatewayResponse = { ...result, requestId: id };
      if (result.decision === "allow") body.data = await resource();
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
        "X-Gateway-Score": String(result.score), ...(status === 429 ? { "Retry-After": "60" } : {}),
      } });
    } catch (error) { return errorResponse(error); }
  };
}
