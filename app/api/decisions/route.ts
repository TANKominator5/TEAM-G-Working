import { requireAdmin } from "@/lib/auth";
import type { Decision } from "@/lib/contracts";
import { ApiFailure, errorResponse } from "@/lib/errors";
import { getDecisions } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get("limit") ?? "25";
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
      throw new ApiFailure(400, "INVALID_LIMIT", "limit must be an integer from 1 to 100.");
    }
    const decision = params.get("decision");
    if (decision !== null && !["allow", "challenge", "block"].includes(decision)) {
      throw new ApiFailure(400, "INVALID_DECISION", "decision must be allow, challenge, or block.");
    }
    return Response.json(await getDecisions(Number(rawLimit), (decision ?? undefined) as Decision | undefined, params.get("cursor") ?? undefined), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return errorResponse(error); }
}
