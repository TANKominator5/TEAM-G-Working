/** Shared frontend/backend contract. Coordinate before changing these types. */
export type Decision = "allow" | "challenge" | "block";
export interface Reason { code: string; message: string; weight: number }
export interface RequestFeatures {
  userAgent: string;
  hasAccept: boolean;
  hasAcceptLanguage: boolean;
  requests10s: number;
  requests60s: number;
  intervalCount: number;
  intervalCv: number | null;
}
export interface ScoreResult { score: number; decision: Decision; reasons: Reason[] }
export interface DecisionRecord extends ScoreResult {
  id: string;
  timestamp: string;
  clientId: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  userAgent: string;
  features: RequestFeatures;
}
export interface StatsResponse {
  windowMinutes: number;
  total: number;
  allowed: number;
  challenged: number;
  blocked: number;
  averageScore: number;
  averageLatencyMs: number;
  series: { timestamp: string; allowed: number; challenged: number; blocked: number }[];
}
export interface DecisionsResponse { decisions: DecisionRecord[]; nextCursor: string | null }
export interface Challenge {
  token: string;
  difficulty: number;
  expiresAt: string;
  algorithm: "sha256";
}
export interface GatewayResponse extends ScoreResult {
  requestId: string;
  challenge?: Challenge;
  retryAfter?: number;
  data?: { message: string; items: { id: string; name: string; price: number }[] };
}
export interface ApiError { error: string; code: string }

export interface TrafficFinding {
  classification: "normal" | "mixed" | "likely_automation" | "insufficient_evidence";
  risk: "low" | "medium" | "high";
  summary: string;
  evidence: string[];
  recommendedAction: "observe" | "challenge" | "block";
  recommendations: string[];
  limitations: string;
}
export interface AnalysisRecord {
  id: string;
  createdAt: string;
  model: string;
  inputHash: string;
  sampleSize: number;
  windowTotal: number;
  windowStart: string;
  windowEnd: string;
  finding: TrafficFinding;
}
export interface AnalysisHistoryResponse { analyses: AnalysisRecord[]; configured: boolean; model: string }
export interface AnalyzeResponse { analysis: AnalysisRecord; cached: boolean }
