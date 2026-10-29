import { z } from "zod";
import { analyzeTraffic } from "@/lib/analysis";
import { requireAdmin } from "@/lib/auth";
import { ApiFailure, errorResponse, readJson } from "@/lib/errors";
import { requireSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    requireAdmin(request);
    if (!z.object({}).strict().safeParse(await readJson(request)).success) {
      throw new ApiFailure(400, "INVALID_ANALYSIS_INPUT", "Analysis uses server-observed traffic only. Send an empty JSON object.");
    }
    return Response.json(await analyzeTraffic(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
