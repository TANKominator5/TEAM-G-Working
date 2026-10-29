import { analysisModel } from "@/lib/analysis";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { getAnalyses } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return Response.json({ analyses: await getAnalyses(), configured: Boolean(process.env.GROQ_API_KEY?.trim()), model: analysisModel() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return errorResponse(error); }
}
