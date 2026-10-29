export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({
    status: "ok", project: "Team G: Bot Detection Gateway", stack: "nextjs",
    configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.GATEWAY_SECRET),
  }, { headers: { "Cache-Control": "no-store" } });
}
