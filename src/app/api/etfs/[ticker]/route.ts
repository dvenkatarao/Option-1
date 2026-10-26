import { ApiError, handle } from "@/lib/api";
import { getEtf, getHistory, getHoldingsAnalystConsensus, getQuotes } from "@/lib/etf-service";
import { getSymbolNews } from "@/lib/news";
import { isValidTicker } from "@/lib/universe";

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

  return Response.json({
    fund,
    history,
    quote: quoteResult.quotes.get(ticker) ?? null,
    quoteFetchedAt: quoteResult.fetchedAt,
    quoteStale: quoteResult.stale,
    analyst,
    news: news?.data ?? [],
    newsFetchedAt: news?.fetchedAt ?? null,
    newsStale: news?.stale ?? false,
  });
});
