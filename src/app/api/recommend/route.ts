import { handle, ApiError } from "@/lib/api";
import { toScreenRow, getRiskFree } from "@/lib/data";
import { getAllEtfs, getQuotes } from "@/lib/etf-service";
import { GOALS, scoreGoal, type Goal } from "@/lib/recommend";
import { getSpreadStats } from "@/lib/snapshots";

export const dynamic = "force-dynamic";

/** Transparent goal-based ranking; percentile ranks are compared within asset class. */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const goalParam = url.searchParams.get("goal") ?? "balanced";
  if (!(goalParam in GOALS)) throw new ApiError(400, "Unknown recommendation goal");
  const goal = goalParam as Goal;
  const assetClass = url.searchParams.get("assetClass");
  const [funds, riskFree, spreads] = await Promise.all([getAllEtfs(), getRiskFree(), getSpreadStats()]);
  const quoteResult = funds.length ? await getQuotes(funds.map((fund) => fund.ticker)) : { quotes: new Map(), fetchedAt: null, stale: false };
  let rows = funds.map((fund) => toScreenRow(fund, quoteResult.quotes.get(fund.ticker), riskFree.rate, { spread: spreads.get(fund.ticker) ?? null }));
  if (assetClass) rows = rows.filter((row) => row.assetClass === assetClass);
  const ranked = scoreGoal(rows, goal, { peerKey: (row) => row.assetClass });

  return Response.json({
    goal,
    goalDefinition: GOALS[goal],
    assetClass: assetClass || "all",
    ranked,
    eligible: rows.length,
    returned: ranked.length,
    comparedWithin: "asset class",
    quoteFetchedAt: quoteResult.fetchedAt,
    quoteStale: quoteResult.stale,
    note: "Rule-based percentile scores use only available provider data. Funds with under 70% metric coverage are omitted; this is research, not investment advice.",
  });
});
