import { withGateway } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withGateway(async () => ({
  message: "You reached the protected inventory API. Sentinel allowed this request.",
  items: [
    { id: "voyager", name: "Voyager Backpack", price: 1499 },
    { id: "compass", name: "Trail Compass", price: 599 },
    { id: "flask", name: "Expedition Flask", price: 899 },
  ],
}));
