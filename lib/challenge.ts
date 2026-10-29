import { createHash, randomUUID } from "node:crypto";
import type { Challenge } from "./contracts";
import { clearanceBinding, cookie, signToken, verifyToken } from "./security";
import { ApiFailure } from "./errors";
import { consumeChallenge } from "./store";

export const CLEARANCE_COOKIE = "sentinel_clearance";
const DIFFICULTY = 4;

export function issueChallenge(request: Request, key: string): Challenge {
  const exp = Date.now() + 5 * 60_000;
  return {
    token: signToken({ kind: "challenge", exp, nonce: randomUUID(), binding: clearanceBinding(request, key), difficulty: DIFFICULTY }),
    difficulty: DIFFICULTY, expiresAt: new Date(exp).toISOString(), algorithm: "sha256",
  };
}

export function hasClearance(request: Request, key: string): boolean {
  const payload = verifyToken(cookie(request, CLEARANCE_COOKIE), "clearance");
  return payload?.binding === clearanceBinding(request, key);
}

export async function solveChallenge(request: Request, key: string, token: string, solution: string): Promise<string> {
  const payload = verifyToken(token, "challenge");
  if (!payload || payload.binding !== clearanceBinding(request, key)
    || typeof payload.nonce !== "string" || typeof payload.exp !== "number" || payload.difficulty !== DIFFICULTY) {
    throw new ApiFailure(400, "INVALID_CHALLENGE", "Challenge is invalid, expired, or belongs to a different client.");
  }
  if (!/^\d{1,12}$/.test(solution) || !createHash("sha256").update(`${token}:${solution}`).digest("hex").startsWith("0".repeat(DIFFICULTY))) {
    throw new ApiFailure(400, "INVALID_PROOF", "Challenge proof is incorrect.");
  }
  // A unique database constraint makes token redemption one-time across instances.
  await consumeChallenge(payload.nonce, payload.exp);
  return signToken({ kind: "clearance", exp: Date.now() + 15 * 60_000, binding: clearanceBinding(request, key) });
}
