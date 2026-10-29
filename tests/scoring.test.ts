import { describe, expect, it } from "vitest";
import { featureSchema, scoreRequest } from "../lib/scoring";
import type { RequestFeatures } from "../lib/contracts";

const normal: RequestFeatures = {
  userAgent: "Mozilla/5.0 Chrome/130", hasAccept: true, hasAcceptLanguage: true,
  requests10s: 1, requests60s: 1, intervalCount: 0, intervalCv: null,
};

describe("explainable scoring", () => {
  it("allows a normal browser", () => {
    expect(scoreRequest(normal)).toMatchObject({ score: 0, decision: "allow" });
  });
  it("does not block tools or missing language by themselves", () => {
    expect(scoreRequest({ ...normal, userAgent: "curl/8.0", hasAcceptLanguage: false }).decision).toBe("allow");
  });
  it("challenges a headerless request with explicit reasons", () => {
    const result = scoreRequest({ ...normal, userAgent: "", hasAccept: false, hasAcceptLanguage: false });
    expect(result).toMatchObject({ score: 45, decision: "challenge" });
    expect(result.reasons.map((reason) => reason.code)).toEqual(["MISSING_USER_AGENT", "MISSING_ACCEPT", "MISSING_LANGUAGE"]);
  });
  it("challenges high bursts and blocks extreme bursts", () => {
    expect(scoreRequest({ ...normal, requests10s: 11, requests60s: 11 }).decision).toBe("challenge");
    expect(scoreRequest({ ...normal, requests10s: 21, requests60s: 21 }).decision).toBe("block");
  });
  it("uses timing only after sufficient samples", () => {
    expect(scoreRequest({ ...normal, intervalCv: 0.01, intervalCount: 4 }).score).toBe(0);
    expect(scoreRequest({ ...normal, intervalCv: 0.01, intervalCount: 5 }).score).toBe(15);
  });
  it("bounds scores and makes additive reasons auditable", () => {
    const result = scoreRequest({ ...normal, userAgent: "", hasAccept: false, requests10s: 150, requests60s: 150 });
    expect(result.score).toBe(100);
    expect(result.decision).toBe("block");
  });
  it("lets challenge clearance resolve every sub-block score", () => {
    const features = { ...normal, userAgent: "curl", hasAcceptLanguage: false, requests10s: 11, requests60s: 11 };
    expect(scoreRequest(features)).toMatchObject({ score: 75, decision: "challenge" });
    expect(scoreRequest(features, true)).toMatchObject({ score: 39, decision: "allow" });
  });
  it("never lets clearance bypass hard rate blocks", () => {
    expect(scoreRequest({ ...normal, requests10s: 21, requests60s: 21 }, true).decision).toBe("block");
  });
  it("validates preview features and rejects unknown bypass flags", () => {
    expect(featureSchema.safeParse({ ...normal, cleared: true }).success).toBe(false);
    expect(featureSchema.safeParse({ ...normal, requests10s: 100, requests60s: 1 }).success).toBe(false);
    expect(featureSchema.safeParse({ ...normal, requests60s: -1 }).success).toBe(false);
    expect(featureSchema.safeParse(normal).success).toBe(true);
  });
});
