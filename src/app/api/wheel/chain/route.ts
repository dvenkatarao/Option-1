import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { getOptionChain } from "@/lib/options-providers";
import { isValidTicker } from "@/lib/universe";
import { yahooQuotes } from "@/lib/yahoo";
import { getStock } from "@/lib/stock-service";
import { recordOptionQuoteSnapshots } from "@/lib/option-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  symbol: z.string().min(1).max(10),
  type: z.enum(["put", "call", "both"]).default("both"),
  dteMin: z.coerce.number().int().min(1).max(365).default(7),
  dteMax: z.coerce.number().int().min(1).max(365).default(75),
});

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    symbol: url.searchParams.get("symbol") ?? "",
    type: url.searchParams.get("type") ?? "both",
    dteMin: url.searchParams.get("dteMin") ?? 7,
    dteMax: url.searchParams.get("dteMax") ?? 75,
  });
  if (!parsed.success) throw new ApiError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const symbol = parsed.data.symbol.toUpperCase();
  if (!isValidTicker(symbol)) throw new ApiError(400, "Invalid ticker");
  let dteMin = parsed.data.dteMin;
  let dteMax = parsed.data.dteMax;
  if (dteMin > dteMax) [dteMin, dteMax] = [dteMax, dteMin];

  const quotes = await yahooQuotes([symbol]).catch(() => []);
  const underlyingQuote = quotes.find((quote) => quote.symbol === symbol) ?? null;
  const stock = await getStock(symbol).catch(() => null);
  const requestedPrice = underlyingQuote?.price ?? stock?.price ?? null;

  const nextEarnings = stock?.events?.nextEarnings ?? null;
  const divYield = stock?.events?.dividendYield ?? 0;
  const want = parsed.data.type;
  const types = want === "both" ? (["put", "call"] as const) : ([want] as const);
  let fetched: Awaited<ReturnType<typeof getOptionChain>>[];
  try {
    // Schwab can provide the underlying quote in the chain itself, so allow it to be the only quote source.
    fetched = await Promise.all(
      types.map((type) => getOptionChain({ symbol, type, price: requestedPrice ?? 0, dteMin, dteMax, divYield })),
    );
  } catch (error) {
    if (requestedPrice == null || !(requestedPrice > 0)) throw new ApiError(404, `No usable underlying price or option chain for ${symbol}`);
    throw error;
  }
  const providerPrice = fetched.find((result) => result.underlyingPrice != null && result.underlyingPrice > 0)?.underlyingPrice ?? requestedPrice;
  if (providerPrice == null || !(providerPrice > 0)) throw new ApiError(404, `No underlying price for ${symbol}`);

  const fetchedAt = fetched.map((r) => r.fetchedAt).filter(Boolean).sort().slice(-1)[0] ?? null;
  const stale = fetched.some((r) => r.stale);
  const delayFlags = fetched.map((result) => result.isDelayed);
  const isDelayed = delayFlags.some((value) => value === true)
    ? true
    : delayFlags.every((value) => value === false) ? false : null;
  const responseContracts = fetched.flatMap((r) => r.contracts.slice(0, 1000));
  const snapshotContracts = fetched.flatMap((r) => r.contracts.slice(0, 120));
  if (fetchedAt) {
    await recordOptionQuoteSnapshots({ ticker: symbol, underlyingPrice: providerPrice, contracts: snapshotContracts, fetchedAt, stale, marketState: underlyingQuote?.marketState, isDelayed }).catch((e) => {
      console.warn("[options] quote snapshot skipped:", e instanceof Error ? e.message : e);
    });
  }

  const contracts = responseContracts
    .filter((c) => c.bid != null || c.ask != null)
    .map((c) => ({
      symbol: c.symbol,
      type: c.type,
      strike: c.strike,
      expiration: c.expiration,
      bid: c.bid,
      ask: c.ask,
      last: c.last,
      iv: c.iv,
      delta: c.delta,
      deltaSource: c.deltaSource,
      gamma: c.gamma ?? null,
      theta: c.theta ?? null,
      vega: c.vega ?? null,
      rho: c.rho ?? null,
      greeksSource: c.greeksSource ?? (c.deltaSource ?? null),
      oi: c.oi,
      volume: c.volume,
      quoteTimestamp: c.quoteTimestamp ?? null,
      source: c.source,
    }))
    .sort((a, b) => a.expiration.localeCompare(b.expiration) || a.type.localeCompare(b.type) || a.strike - b.strike);


  return Response.json({
    symbol,
    price: providerPrice,
    nextEarnings,
    source: [...new Set(fetched.map((r) => r.source))].join("+"),
    fetchedAt,
    stale,
    isDelayed,
    fallbackReasons: [...new Set(fetched.map((r) => r.fallbackReason).filter((reason): reason is string => Boolean(reason)))],
    contracts,
  });
});
