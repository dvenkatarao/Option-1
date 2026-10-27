import { handle, ApiError } from "@/lib/api";
import { toScreenRow, getRiskFree } from "@/lib/data";
import { getAllEtfs, getHoldingsAnalystConsensus, getQuotes } from "@/lib/etf-service";
import { GOALS, scoreGoal, type Goal, type Weight } from "@/lib/recommend";
import { getSpreadStats } from "@/lib/snapshots";
import { mapLimit } from "@/lib/http";
import { analystScoreForCoverage, MIN_ANALYST_REC_COVERAGE, OPTIONAL_ANALYST_SCORE_WEIGHT } from "@/lib/analyst-consensus";

export const dynamic = "force-dynamic";

/** Transparent goal-based ranking; percentile ranks are compared within asset class. */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const goalParam = url.searchParams.get("goal") ?? "balanced";
  if (!(goalParam in GOALS)) throw new ApiError(400, "Unknown recommendation goal");
  const goal = goalParam as Goal;
  const assetClass = url.searchParams.get("assetClass");
  const includeAnalyst = url.searchParams.get("analyst") === "1";
  const [funds, riskFree, spreads] = await Promise.all([getAllEtfs(), getRiskFree(), getSpreadStats()]);
  const quoteResult = funds.length ? await getQuotes(funds.map((fund) => fund.ticker)) : { quotes: new Map(), fetchedAt: null, stale: false };
  let rows = funds.map((fund) => toScreenRow(fund, quoteResult.quotes.get(fund.ticker), riskFree.rate, { spread: spreads.get(fund.ticker) ?? null }));
  if (assetClass) rows = rows.filter((row) => row.assetClass === assetClass);

  let weights: Weight[] = GOALS[goal].weights;
  let analystCoverage = {
    requested: includeAnalyst,
    minimumCoverage: MIN_ANALYST_REC_COVERAGE,
    scoreWeight: includeAnalyst ? OPTIONAL_ANALYST_SCORE_WEIGHT : 0,
    fundsWithUsableCoverage: 0,
    fundsScreened: rows.length,
    coveragePct: 0,
  };

  if (includeAnalyst) {
    const results = await mapLimit(rows, 3, async (row) => {
      const data = await getHoldingsAnalystConsensus(row.ticker).catch(() => null);
      const coverage = data?.consensus.recCoverageWeight ?? null;
      const recommendation = analystScoreForCoverage(data?.consensus, MIN_ANALYST_REC_COVERAGE);
      return { ticker: row.ticker, recommendation, coverage };
    });
    const byTicker = new Map(results.map((result) => [result.ticker, result]));
    rows = rows.map((row) => ({
      ...row,
      analystRec: byTicker.get(row.ticker)?.recommendation ?? null,
      analystCoverage: byTicker.get(row.ticker)?.coverage ?? null,
    }));
    const fundsWithUsableCoverage = rows.filter((row) => row.analystRec != null).length;
    analystCoverage = {
      ...analystCoverage,
      fundsWithUsableCoverage,
      coveragePct: rows.length ? fundsWithUsableCoverage / rows.length : 0,
    };
    weights = [
      ...GOALS[goal].weights.map((weight) => ({ ...weight, w: weight.w * (1 - OPTIONAL_ANALYST_SCORE_WEIGHT) })),
      {
        metric: "analystRec",
        label: "Holdings-weighted analyst consensus · 1=strong buy, 5=sell",
        w: OPTIONAL_ANALYST_SCORE_WEIGHT,
        higherIsBetter: false,
      },
    ];
  }

  const ranked = scoreGoal(rows, goal, { weights, peerKey: (row) => row.assetClass });
  const goalDefinition = { ...GOALS[goal], weights };
  const note = includeAnalyst
    ? `Rule-based percentile scores use provider and stored-history data. The optional holdings-weighted analyst score adds 10% only when recommendations cover at least ${MIN_ANALYST_REC_COVERAGE * 100}% of each fund's reported top-holdings weight; unavailable analyst values are omitted and remaining score weights are renormalized. Row-level data coverage and analyst coverage are exposed. This is research, not investment advice.`
    : "Rule-based percentile scores use only available provider data. Funds with under 70% metric coverage are omitted; analyst consensus is excluded unless explicitly enabled. This is research, not investment advice.";

  return Response.json({
    goal,
    goalDefinition,
    assetClass: assetClass || "all",
    ranked,
    eligible: rows.length,
    returned: ranked.length,
    comparedWithin: "asset class",
    quoteFetchedAt: quoteResult.fetchedAt,
    quoteStale: quoteResult.stale,
    analystCoverage,
    note,
  });
});
