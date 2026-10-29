import { isDemoRunId, type Challenge } from "@/lib/contracts";

const STORAGE_KEY = "sentinel_pending_challenge";
export function rememberChallenge(challenge: Challenge, demoRunId?: string): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ challenge, demoRunId })); }
  catch { /* A fresh challenge can still be requested if browser storage is unavailable. */ }
}
export function pendingChallenge(): { challenge: Challenge; demoRunId?: string } | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    const challenge = stored?.challenge;
    if (!challenge || typeof challenge.token !== "string" || challenge.token.length > 2048
      || !Number.isInteger(challenge.difficulty) || challenge.difficulty < 1 || challenge.difficulty > 4
      || challenge.algorithm !== "sha256" || typeof challenge.expiresAt !== "string"
      || !(Date.parse(challenge.expiresAt) > Date.now())) return null;
    if (stored.demoRunId !== undefined && !isDemoRunId(stored.demoRunId)) return null;
    return stored;
  } catch { return null; }
}
export function forgetChallenge(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Browser storage may be disabled. */ }
}
