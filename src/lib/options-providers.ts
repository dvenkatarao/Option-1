/**
 * Read-only option-chain providers: connected Schwab Market Data -> configured Alpaca -> Yahoo in auto mode.
 * Provider-specific payloads are normalized in options-parse.ts; quote freshness and source remain visible to callers.
 */
import { getEnv } from "./env";
import { cached } from "./cache";
import { getRiskFree } from "./data";
import { fetchJson } from "./http";
import { crumbFetch } from "./yahoo";
import { addModelDeltas, parseAlpaca, parseSchwabChain, parseYahooResult, runProviders, type ChainResult } from "./options-parse";
import { getSchwabAccessToken, hasStoredSchwabConnection, schwabMarketDataConfigured } from "./schwab-auth";
import type { OptionContract, OptionType } from "./wheel";

export type ChainRequest = { symbol: string; type: OptionType; price: number; dteMin: number; dteMax: number; divYield?: number };

const MAX_PAGES = 8;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Strike window: puts from 60% of spot up to spot, calls from 95% to 140% of spot. */
function strikeWindow(type: OptionType, price: number): [number, number] {
  return type === "put" ? [Math.floor(price * 0.6), Math.ceil(price)] : [Math.floor(price * 0.95), Math.ceil(price * 1.4)];
}

export function alpacaConfigured(): boolean {
  const e = getEnv();
  return !!e.ALPACA_API_KEY && !!e.ALPACA_SECRET_KEY;
}

async function paged<T>(urlFor: (token: string | null) => string, headers: Record<string, string>, pick: (j: any) => { items: T[]; next: string | null }): Promise<T[]> {
  const out: T[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const j = await fetchJson<unknown>(urlFor(token), { headers, retries: 1, timeoutMs: 20000 });
    const { items, next } = pick(j);
    out.push(...items);
    if (!next) return out;
    token = next;
  }
  return out;
}

async function alpacaChain(req: ChainRequest): Promise<OptionContract[]> {
  const e = getEnv();
  const headers = { "APCA-API-KEY-ID": e.ALPACA_API_KEY!, "APCA-API-SECRET-KEY": e.ALPACA_SECRET_KEY! };
  const [lo, hi] = strikeWindow(req.type, req.price);
  const from = isoDay(req.dteMin);
  const to = isoDay(req.dteMax);
  const range = `expiration_date_gte=${from}&expiration_date_lte=${to}&strike_price_gte=${lo}&strike_price_lte=${hi}`;
  const tradingHost = e.ALPACA_PAPER === "true" ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";

  const [snapPages, contracts] = await Promise.all([
    paged<Record<string, any>>(
      (t) => `https://data.alpaca.markets/v1beta1/options/snapshots/${encodeURIComponent(req.symbol)}?feed=${e.ALPACA_OPTIONS_FEED}&type=${req.type}&${range}&limit=1000${t ? `&page_token=${encodeURIComponent(t)}` : ""}`,
      headers,
      (j) => ({ items: [j?.snapshots ?? {}], next: j?.next_page_token ?? null }),
    ),
    paged<any>(
      (t) => `${tradingHost}/v2/options/contracts?underlying_symbols=${encodeURIComponent(req.symbol)}&type=${req.type}&${range}&limit=1000${t ? `&page_token=${encodeURIComponent(t)}` : ""}`,
      headers,
      (j) => ({ items: j?.option_contracts ?? [], next: j?.next_page_token ?? null }),
    ),
  ]);
  const snapshots: Record<string, any> = Object.assign({}, ...snapPages);
  return parseAlpaca(snapshots, contracts);
}

async function schwabChain(req: ChainRequest): Promise<{ contracts: OptionContract[]; underlyingPrice: number | null; isDelayed: boolean | null }> {
  const token = await getSchwabAccessToken();
  const params = new URLSearchParams({
    symbol: req.symbol,
    contractType: req.type === "put" ? "PUT" : "CALL",
    fromDate: isoDay(req.dteMin),
    toDate: isoDay(req.dteMax),
    range: "ALL",
    strategy: "SINGLE",
    includeUnderlyingQuote: "true",
  });
  const payload = await fetchJson<unknown>(`https://api.schwabapi.com/marketdata/v1/chains?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    retries: 1,
    timeoutMs: 20_000,
  });
  const parsed = parseSchwabChain(payload, req.type);
  const spot = parsed.underlyingPrice ?? req.price;
  const [lo, hi] = spot > 0 ? strikeWindow(req.type, spot) : [0, Number.POSITIVE_INFINITY];
  const from = isoDay(req.dteMin);
  const to = isoDay(req.dteMax);
  return {
    contracts: parsed.contracts.filter((contract) => contract.strike >= lo && contract.strike <= hi && contract.expiration >= from && contract.expiration <= to),
    underlyingPrice: parsed.underlyingPrice,
    isDelayed: parsed.isDelayed,
  };
}

async function yahooChain(req: ChainRequest): Promise<{ contracts: OptionContract[]; underlyingPrice: number | null; isDelayed: null }> {
  const url = (crumb: string, date?: number) =>
    `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(req.symbol)}?${date ? `date=${date}&` : ""}crumb=${encodeURIComponent(crumb)}`;
  const first = parseYahooResult(JSON.parse(await crumbFetch((c) => url(c))), req.type);
  const fromMs = Date.parse(isoDay(req.dteMin) + "T00:00:00Z");
  const toMs = Date.parse(isoDay(req.dteMax) + "T23:59:59Z");
  const wanted = first.expirations.filter((x) => x * 1000 >= fromMs && x * 1000 <= toMs);
  const have = new Set(first.contracts.map((c) => c.expiration));
  const all = [...first.contracts];
  for (const exp of wanted.slice(0, 8)) {
    const day = new Date(exp * 1000).toISOString().slice(0, 10);
    if (have.has(day)) continue;
    const r = parseYahooResult(JSON.parse(await crumbFetch((c) => url(c, exp))), req.type);
    all.push(...r.contracts);
  }
  const spot = first.price ?? req.price;
  const [lo, hi] = strikeWindow(req.type, spot);
  return {
    contracts: all.filter((c) => c.strike >= lo && c.strike <= hi && c.expiration >= isoDay(req.dteMin) && c.expiration <= isoDay(req.dteMax)),
    underlyingPrice: first.price,
    isDelayed: null,
  };
}

async function riskFreeRate(): Promise<number> {
  const e = getEnv();
  if (e.RISK_FREE_RATE != null) return e.RISK_FREE_RATE;
  const rf = await getRiskFree();
  return rf.rate ?? 0.04; // last-resort assumption; only used to model delta when the feed has none
}

/** Fetch one side of a chain: connected Schwab → Alpaca → Yahoo in auto mode. */
export async function fetchOptionChain(req: ChainRequest): Promise<ChainResult> {
  const e = getEnv();
  const providers: Parameters<typeof runProviders>[0] = [];
  const unavailable: string[] = [];

  if (e.OPTIONS_PROVIDER === "schwab") {
    providers.push({ name: "schwab", fn: () => schwabChain(req) });
  } else if (e.OPTIONS_PROVIDER === "auto") {
    if (schwabMarketDataConfigured()) {
      if (await hasStoredSchwabConnection()) providers.push({ name: "schwab", fn: () => schwabChain(req) });
      else unavailable.push("Schwab is not connected");
    }
    if (alpacaConfigured()) providers.push({ name: "alpaca", fn: () => alpacaChain(req) });
    else unavailable.push("Alpaca keys are not configured");
    providers.push({ name: "yahoo", fn: () => yahooChain(req) });
  } else if (e.OPTIONS_PROVIDER === "alpaca") {
    if (alpacaConfigured()) providers.push({ name: "alpaca", fn: () => alpacaChain(req) });
    else providers.push({ name: "alpaca", fn: async () => { throw new Error("ALPACA_API_KEY / ALPACA_SECRET_KEY are not set"); } });
  } else {
    providers.push({ name: "yahoo", fn: () => yahooChain(req) });
  }

  const result = await runProviders(providers);
  if (unavailable.length) {
    return { ...result, fallbackReason: [unavailable.join("; "), result.fallbackReason].filter(Boolean).join("; ") };
  }
  return result;
}

/** Force a direct Schwab market-data request for the authenticated connection's first-chain check. */
export async function testSchwabOptionChain(symbol: string) {
  const data = await schwabChain({ symbol, type: "put", price: 0, dteMin: 0, dteMax: 60 });
  return { ...data, source: "schwab" as const, fetchedAt: new Date().toISOString() };
}

/** Cached chain with model deltas filled in where the feed gave none. */
export async function getOptionChain(req: ChainRequest, ttlSec = 120) {
  // Cache provider quotes, not derived Greeks: spot and dividend yield can change between callers.
  const key = `opt:chain:v2:${getEnv().OPTIONS_PROVIDER}:${req.symbol}:${req.type}:${req.dteMin}-${req.dteMax}`;
  const c = await cached(key, ttlSec, () => fetchOptionChain(req));
  const rate = await riskFreeRate();
  const today = new Date().toISOString().slice(0, 10);
  const underlyingPrice = c.data.underlyingPrice != null && c.data.underlyingPrice > 0 ? c.data.underlyingPrice : req.price;
  const contracts = addModelDeltas(c.data.contracts, underlyingPrice, rate, today, req.divYield ?? 0);
  return { ...c.data, underlyingPrice, contracts, rate, fetchedAt: c.fetchedAt, stale: c.stale };
}
