import { handle } from "@/lib/api";
import { toScreenRow, getRiskFree } from "@/lib/data";
import { getAllEtfs, getQuotes, staleTickers } from "@/lib/etf-service";
import { getSpreadStats } from "@/lib/snapshots";
import { UNIVERSE } from "@/lib/universe";

export const dynamic = "force-dynamic";

/** Live ETF screener data. Missing provider values remain null and are rendered as N/A. */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const [funds, pending, riskFree, spreads] = await Promise.all([
    getAllEtfs(),
    staleTickers(),
    getRiskFree(),
    getSpreadStats(),
  ]);
  const quotes = funds.length ? await getQuotes(funds.map((fund) => fund.ticker)) : { quotes: new Map(), fetchedAt: null, stale: false };
  const rows = funds
    .filter((fund) => !query || `${fund.ticker} ${fund.name ?? ""} ${fund.family ?? ""} ${fund.category ?? ""}`.toLowerCase().includes(query))
    .map((fund) => toScreenRow(fund, quotes.quotes.get(fund.ticker), riskFree.rate, { spread: spreads.get(fund.ticker) ?? null }));

  return Response.json({
    rows,
    count: rows.length,
    hydrated: funds.length,
    totalUniverse: UNIVERSE.length,
    remaining: pending.length,
    refreshedAt: quotes.fetchedAt,
    stale: quotes.stale,
    riskFreeRate: riskFree.rate,
    riskFreeDate: riskFree.date,
  });
});
