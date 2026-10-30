import { handle } from "@/lib/api";
import { toScreenRow, getRiskFree } from "@/lib/data";
import { getAllEtfs, getQuotes, staleTickers } from "@/lib/etf-service";
import { getSpreadStats } from "@/lib/snapshots";
import { getEffectiveEtfUniverse } from "@/lib/etf-universe-discovery";

export const dynamic = "force-dynamic";

/** Live ETF screener data. Missing provider values remain null and are rendered as N/A. */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const [funds, pending, riskFree, spreads, universe] = await Promise.all([
    getAllEtfs(),
    staleTickers(),
    getRiskFree(),
    getSpreadStats(),
    getEffectiveEtfUniverse(),
  ]);
  const quotes = funds.length ? await getQuotes(funds.map((fund) => fund.ticker)) : { quotes: new Map(), fetchedAt: null, stale: false };
  const rows = funds
    .filter((fund) => {
      if (!query) return true;
      const metadata = `${fund.ticker} ${fund.name ?? ""} ${fund.family ?? ""} ${fund.category ?? ""}`;
      const holdings = (fund.profile?.holdings ?? []).map((holding) => `${holding.symbol ?? ""} ${holding.name}`).join(" ");
      return `${metadata} ${holdings}`.toLowerCase().includes(query);
    })
    .map((fund) => toScreenRow(fund, quotes.quotes.get(fund.ticker), riskFree.rate, { spread: spreads.get(fund.ticker) ?? null }));
  const categories = Array.from(new Set(funds.map((fund) => fund.category?.trim()).filter((category): category is string => Boolean(category)))).sort((a, b) => a.localeCompare(b));

  return Response.json({
    rows,
    categories,
    count: rows.length,
    hydrated: funds.length,
    totalUniverse: universe.status.totalCount,
    universe: universe.status,
    remaining: pending.length,
    refreshedAt: quotes.fetchedAt,
    stale: quotes.stale,
    riskFreeRate: riskFree.rate,
    riskFreeDate: riskFree.date,
  });
});
