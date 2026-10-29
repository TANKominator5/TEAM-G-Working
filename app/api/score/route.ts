import { requireAdmin } from "@/lib/auth";
import { ApiFailure, errorResponse, readJson } from "@/lib/errors";
import { requireSameOrigin } from "@/lib/security";
import { featureSchema, scoreRequest } from "@/lib/scoring";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    requireAdmin(request);
    const parsed = featureSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiFailure(400, "INVALID_FEATURES", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    // A preview only. Never use caller-provided features to authorize /protected.
    return Response.json({ ...scoreRequest(parsed.data), preview: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
