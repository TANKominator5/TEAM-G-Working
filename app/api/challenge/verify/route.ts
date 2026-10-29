import { z } from "zod";
import { solveChallenge, CLEARANCE_COOKIE } from "@/lib/challenge";
import { ApiFailure, errorResponse, readJson } from "@/lib/errors";
import { requireSameOrigin, sessionCookie } from "@/lib/security";
import { requestIdentity } from "@/lib/request-identity";
import { recordRequest } from "@/lib/store";

export const runtime = "nodejs";
const schema = z.object({ token: z.string().max(2048), solution: z.string().regex(/^\d{1,12}$/) }).strict();
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiFailure(400, "INVALID_PROOF", "Provide a challenge token and decimal solution string.");
    const { key, realKey } = requestIdentity(request);
    const window = await recordRequest(`verify_${realKey}`);
    if (window.requests60s > 10) throw new ApiFailure(429, "VERIFY_RATE_LIMITED", "Too many proof attempts. Wait one minute.");
    const token = await solveChallenge(request, key, parsed.data.token, parsed.data.solution);
    return Response.json({ verified: true, expiresIn: 900 }, { headers: {
      "Set-Cookie": sessionCookie(CLEARANCE_COOKIE, token, 900), "Cache-Control": "no-store",
    } });
  } catch (error) { return errorResponse(error); }
}
