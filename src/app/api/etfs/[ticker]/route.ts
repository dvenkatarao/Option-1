import { ApiError, handle } from "@/lib/api";
import { getEtf, getHistory, getHoldingsAnalystConsensus, getQuotes } from "@/lib/etf-service";
import { getSymbolNews } from "@/lib/news";
import { isValidTicker } from "@/lib/universe";
import { computeEtfTrendSignal } from "@/lib/etf-signals";
import { buildTakeaway } from "@/lib/etf-takeaway";
import { qualityForRow } from "@/lib/quality";
import { rateTagForEtf } from "@/lib/etf-rate-sensitivity";
import { isLeveragedOrInverse } from "@/lib/format";
import { assetClassOf } from "@/lib/recommend";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ ticker: string }> };

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ticker = (await params).ticker.toUpperCase();
  if (!isValidTicker(ticker)) throw new ApiError(400, "Invalid ticker");
  const fund = await getEtf(ticker);
  if (!fund) throw new ApiError(404, `No stored ETF data for ${ticker}`);

  const [history, quoteResult, analyst, news] = await Promise.all([
    getHistory(ticker),
    getQuotes([ticker]),
    getHoldingsAnalystConsensus(ticker).catch(() => null),
    getSymbolNews(ticker).catch(() => null),
  ]);
  const quote = quoteResult.quotes.get(ticker) ?? null;
  const assetClass = assetClassOf(fund.category, fund.profile?.allocation);
  const rate = rateTagForEtf({ ticker, category: fund.category, name: fund.name, assetClass });
  const metrics = fund.metrics;
  const takeaway = buildTakeaway({
    ticker,
    name: fund.name,
    category: fund.category,
    quality: qualityForRow(fund, quote),
    expense: fund.expenseRatio,
    yieldTtm: metrics?.dividends.ttmYield ?? null,
    ttmAmount: metrics?.dividends.ttmAmount ?? null,
    erosionLevel: metrics?.erosion.level ?? "n/a",
    priceRet3y: metrics?.erosion.priceReturnAnn3y ?? null,
    capFunded: metrics?.erosion.capitalFundedShare3y ?? null,
    vol3y: metrics?.vol3y ?? null,
    dd3y: metrics?.maxDrawdown3y ?? null,
    sharpe: null,
    aum: fund.totalAssets ?? quote?.netAssets ?? null,
    rateTag: rate.tag,
    rateLabel: rate.label,
    leveraged: isLeveragedOrInverse(fund.category, fund.name),
    low52w: metrics?.low52w ?? null,
    high52w: metrics?.high52w ?? null,
    fromHigh: metrics?.fromHigh52w ?? null,
    sectorTop: fund.profile?.sectors?.[0] ?? null,
    totalReturn3y: metrics?.returns["3Y"]?.total ?? null,
  });

  return Response.json({
    fund,
    history,
    technical: computeEtfTrendSignal(history),
    takeaway: {
      ...takeaway,
      context: {
        historyAsOf: metrics?.asOf ?? null,
        quoteFetchedAt: quoteResult.fetchedAt,
        sources: Object.values(fund.sources ?? {}),
      },
    },
    quote,
    quoteFetchedAt: quoteResult.fetchedAt,
    quoteStale: quoteResult.stale,
    analyst,
    news: news?.data ?? [],
    newsFetchedAt: news?.fetchedAt ?? null,
    newsStale: news?.stale ?? false,
  });
});
