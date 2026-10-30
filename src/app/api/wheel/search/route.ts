import { handle } from "@/lib/api";
import { getAllStocks, gradeStock } from "@/lib/stock-service";
import { stockUniverse } from "@/lib/stock-universe";
import { getLiveTickerHydrationCandidate, searchLiveStockProfiles } from "@/lib/live-stock-search";

export const dynamic = "force-dynamic";

/** Search hydrated, provider-backed stock profiles by ticker or company name. */
export const GET = handle(async (req: Request) => {
  const query = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!query) return Response.json({ query, profiles: [], tickerLookup: null });

  const rows = await getAllStocks();
  const profiles = rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    sector: row.sector,
    grade: gradeStock(row).grade,
    refreshedAt: row.refreshedAt?.toISOString() ?? null,
    lastError: row.lastError,
  }));
  const matches = searchLiveStockProfiles(profiles, query);
  const tickerLookup = getLiveTickerHydrationCandidate(query, profiles, stockUniverse());

  return Response.json({ query, profiles: matches, tickerLookup });
});
