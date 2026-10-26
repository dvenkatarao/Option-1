import { handle } from "@/lib/api";
import { getIvRanks, getWheelResults } from "@/lib/wheel-service";
import { parseFilters } from "@/lib/wheel-filters";

export const dynamic = "force-dynamic";

/** Scored wheel opportunities from hydrated fundamentals and current provider option-chain scans. */
export const GET = handle(async (req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseFilters(params);
  const results = await getWheelResults(filters);
  const ivRanks = await getIvRanks(results.rows.map((row) => row.g.row.ticker));
  return Response.json({
    ...results,
    ivRanks: Object.fromEntries(ivRanks),
    generatedAt: new Date().toISOString(),
  });
});
