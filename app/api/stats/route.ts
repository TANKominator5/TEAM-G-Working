import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getStats } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return Response.json(await getStats(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
