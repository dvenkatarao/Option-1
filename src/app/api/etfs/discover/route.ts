import { ApiError, handle } from "@/lib/api";
import { getEffectiveEtfUniverse, getEtfUniverseStatus, refreshEtfUniverse } from "@/lib/etf-universe-discovery";

export const dynamic = "force-dynamic";
// The provider's free tier is limited to five requests per minute; allow time for a complete, rate-limited pagination pass.
export const maxDuration = 300;

/** Status-only read. It never contacts the provider. */
export const GET = handle(async () => Response.json(await getEtfUniverseStatus()));

/** Force a fresh provider listing. Discovery only updates the ticker catalog; hydration remains batch-limited. */
export const POST = handle(async () => {
  if (!process.env.POLYGON_API_KEY?.trim()) {
    throw new ApiError(503, "ETF discovery requires POLYGON_API_KEY. The curated seed universe remains available without it.");
  }

  let result: Awaited<ReturnType<typeof refreshEtfUniverse>>;
  try {
    result = await refreshEtfUniverse(true);
  } catch {
    throw new ApiError(502, "Massive/Polygon ETF discovery failed. Any previously cached universe remains available.");
  }
  const universe = await getEffectiveEtfUniverse();
  return Response.json({
    universe: universe.status,
    stale: result.stale,
    message: result.stale
      ? "The provider could not refresh the listing; the last successful snapshot is being used."
      : "Universe discovery completed; it does not hydrate every symbol. Price/profile hydration remains limited to bounded batches.",
  });
});
