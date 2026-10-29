import { authRequired, isAuthenticated, ADMIN_COOKIE } from "@/lib/auth";
import { ApiFailure, errorResponse, readJson } from "@/lib/errors";
import { clientKey, requireSameOrigin, safeEqual, sessionCookie, signToken } from "@/lib/security";
import { recordRequest } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  try {
    return Response.json({ authenticated: isAuthenticated(request), required: authRequired() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!authRequired()) return Response.json({ authenticated: true });
    const window = await recordRequest(`auth_${clientKey(request)}`);
    if (window.requests60s > 10) throw new ApiFailure(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Wait one minute.");
    const body = await readJson(request) as { password?: unknown };
    if (!body || typeof body.password !== "string" || body.password.length > 256 || !safeEqual(body.password, process.env.DASHBOARD_PASSWORD!)) {
      throw new ApiFailure(401, "INVALID_PASSWORD", "Incorrect dashboard password.");
    }
    const token = signToken({ kind: "admin", exp: Date.now() + 8 * 60 * 60_000 });
    return Response.json({ authenticated: true }, { headers: {
      "Set-Cookie": sessionCookie(ADMIN_COOKIE, token, 8 * 60 * 60), "Cache-Control": "no-store",
    } });
  } catch (error) { return errorResponse(error); }
}

export function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    return Response.json({ authenticated: false }, { headers: {
      "Set-Cookie": sessionCookie(ADMIN_COOKIE, "", 0), "Cache-Control": "no-store",
    } });
  } catch (error) { return errorResponse(error); }
}
