import { z } from "zod";
import type { Reason, RequestFeatures, ScoreResult } from "./contracts";

export const featureSchema = z.object({
  userAgent: z.string().max(512),
  hasAccept: z.boolean(),
  hasAcceptLanguage: z.boolean(),
  requests10s: z.number().int().min(0).max(1_000_000),
  requests60s: z.number().int().min(0).max(1_000_000),
  intervalCount: z.number().int().min(0).max(255),
  intervalCv: z.number().finite().min(0).max(1000).nullable(),
}).strict().refine((f) => f.requests10s <= f.requests60s, {
  message: "requests10s cannot exceed requests60s", path: ["requests10s"],
});

export function scoreRequest(features: RequestFeatures, cleared = false): ScoreResult {
  const reasons: Reason[] = [];
  const add = (code: string, message: string, weight: number) => reasons.push({ code, message, weight });

  if (!features.userAgent.trim()) add("MISSING_USER_AGENT", "User-Agent header is absent.", 25);
  else if (/curl|wget|python-requests|python-httpx|scrapy|headless|selenium|playwright/i.test(features.userAgent)) {
    add("AUTOMATION_USER_AGENT", "User-Agent identifies an automation tool; this alone does not prove abuse.", 15);
  }
  if (!features.hasAccept) add("MISSING_ACCEPT", "Accept header is absent.", 10);
  if (!features.hasAcceptLanguage) add("MISSING_LANGUAGE", "Accept-Language is absent; a weak supporting signal.", 10);

  if (features.requests10s > 20) add("EXTREME_BURST", "More than 20 requests in 10 seconds.", 80);
  else if (features.requests10s > 10) add("HIGH_BURST", "More than 10 requests in 10 seconds.", 50);
  else if (features.requests10s > 5) add("ELEVATED_BURST", "More than 5 requests in 10 seconds.", 25);

  if (features.requests60s > 120) add("EXTREME_RATE", "More than 120 requests in 60 seconds.", 80);
  else if (features.requests60s > 60) add("HIGH_RATE", "More than 60 requests in 60 seconds.", 45);
  else if (features.requests60s > 30) add("ELEVATED_RATE", "More than 30 requests in 60 seconds.", 20);

  if (features.intervalCount >= 5 && features.intervalCv !== null && features.intervalCv < 0.15) {
    add("REGULAR_TIMING", "Recent request intervals are unusually regular.", 15);
  }
  const raw = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  // Clearance reduces weak-signal challenges but NEVER bypasses the hard block threshold.
  if (cleared && raw < 80 && raw > 0) {
    add("VALID_CLEARANCE", "A recent browser challenge was completed.", -Math.min(raw, Math.max(30, raw - 39)));
  }
  if (reasons.length === 0) add("NORMAL_TRAFFIC", "No suspicious signals were observed.", 0);
  const score = Math.max(0, Math.min(100, reasons.reduce((sum, reason) => sum + reason.weight, 0)));
  return { score, decision: score >= 80 ? "block" : score >= 40 ? "challenge" : "allow", reasons };
}
