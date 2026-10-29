import { withGateway } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A discoverable trap, not an inventory export. Never executes or reveals data.
export const GET = withGateway(async () => ({ message: "", items: [] }), { honeypot: true });
export function HEAD() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
