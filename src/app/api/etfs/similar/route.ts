import { handle } from "@/lib/api";
import { getAllEtfs, getHistories } from "@/lib/etf-service";
import { buildEtfSimilarityGroups } from "@/lib/etf-similarity";
import { assetClassOf } from "@/lib/recommend";

export const dynamic = "force-dynamic";

/** Build similar-fund groups from stored daily history and reported top holdings; never discovers or refreshes funds. */
export const GET = handle(async () => {
  const funds = await getAllEtfs();
  const histories = await getHistories(funds.map((fund) => fund.ticker));
  const result = buildEtfSimilarityGroups(
    funds.map((fund) => ({
      ticker: fund.ticker,
      name: fund.name,
      assetClass: assetClassOf(fund.category, fund.profile?.allocation),
      holdings: fund.profile?.holdings ?? [],
    })),
    histories,
  );
  const latestTimestamps = Object.values(histories).flatMap((history) => history.t.slice(-1));

  return Response.json({
    ...result,
    generatedAt: new Date().toISOString(),
    sourceAsOf: latestTimestamps.length ? new Date(Math.max(...latestTimestamps) * 1000).toISOString().slice(0, 10) : null,
    storedFunds: funds.length,
    historiesAvailable: Object.keys(histories).length,
  });
});
