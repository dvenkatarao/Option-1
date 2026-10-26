import { SOURCES, VERIFIED_ON } from "@/lib/sources";

export const dynamic = "force-dynamic";

/** Public catalog metadata only; provider credentials are read exclusively from server env. */
export async function GET() {
  return Response.json({
    verifiedOn: VERIFIED_ON,
    sources: SOURCES.map(({ health: _health, ...source }) => source),
  });
}
