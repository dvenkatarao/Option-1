import { ApiError, handle } from "@/lib/api";
import { getQuotes } from "@/lib/etf-service";
import { cachedOrNull } from "@/lib/cache";
import { getStock, gradeStock } from "@/lib/stock-service";
import { isValidTicker } from "@/lib/universe";
import { yahooBars } from "@/lib/yahoo";

type Context = { params: Promise<{ ticker: string }> };

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ticker = (await params).ticker.toUpperCase();
  if (!isValidTicker(ticker)) throw new ApiError(400, "Invalid ticker");
  const stock = await getStock(ticker);
  if (!stock) throw new ApiError(404, `No stored stock data for ${ticker}; hydrate the stock first`);

  const [quoteResult, historyResult] = await Promise.all([
    getQuotes([ticker]),
    cachedOrNull(`wheel:price-history:v1:${ticker}`, 6 * 60 * 60, () => yahooBars(ticker, "2y")),
  ]);
  const quote = quoteResult.quotes.get(ticker) ?? null;
  const quality = stock.fundamentals ? gradeStock(stock).quality : null;
  const bars = historyResult?.data.bars ?? [];

  return Response.json({
    stock: {
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      industry: stock.industry,
      marketCap: stock.marketCap,
      storedPrice: stock.price,
      fundamentals: stock.fundamentals,
      events: stock.events,
      technicals: stock.technicals,
      grade: quality?.grade ?? null,
      quality,
      refreshedAt: stock.refreshedAt?.toISOString() ?? null,
      priceBarAsOf: stock.technicals?.asOf ?? null,
      lastError: stock.lastError,
    },
    quote,
    quoteFetchedAt: quoteResult.fetchedAt,
    quoteStale: quoteResult.stale,
    quoteSource: "Yahoo Finance (unofficial; delayed)",
    history: bars,
    historyFetchedAt: historyResult?.fetchedAt ?? null,
    historyStale: historyResult?.stale ?? false,
    historySource: historyResult ? "Yahoo Finance chart API (unofficial)" : null,
  });
});
