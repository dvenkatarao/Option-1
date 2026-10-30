import { getSchwabConnectionStatus } from "@/lib/schwab-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await getSchwabConnectionStatus(), { headers: { "Cache-Control": "no-store" } });
}
