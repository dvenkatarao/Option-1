import { handle } from "@/lib/api";
import { disconnectSchwab } from "@/lib/schwab-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = handle(async () => {
  await disconnectSchwab();
  return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
});
