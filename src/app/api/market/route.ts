import { handle } from "@/lib/api";
import { getQuotes } from "@/lib/etf-service";
import { MARKET_INDEXES } from "@/lib/universe";

export const dynamic = "force-dynamic";

/** Delayed market quotes from the configured quote provider; no synthetic values are substituted. */
export const GET = handle(async () => {
  const symbols = [...new Set([...MARKET_INDEXES.map((item) => item.symbol), "SPY", "QQQ", "TLT", "BIL", "SCHD"])];
  const result = await getQuotes(symbols);
  return Response.json({
    items: symbols.map((symbol) => {
      const quote = result.quotes.get(symbol);
      return { symbol, price: quote?.price ?? null, change: quote?.change ?? null, changePct: quote?.changePct ?? null, marketState: quote?.marketState ?? null };
    }),
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    source: "Yahoo Finance delayed quotes (unofficial)",
  });
});
