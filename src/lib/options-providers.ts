/**
 * Option-chain providers with automatic failover: Alpaca (primary, when keys are set) -> Yahoo (backup).
 * Alpaca supplies bid/ask, greeks and implied volatility (snapshots) plus open interest (trading API contracts).
 * Yahoo supplies bid/ask, implied volatility and open interest; delta is modelled with Black-Scholes.
 */
import { getEnv } from "./env";
import { cached } from "./cache";
import { getRiskFree } from "./data";
import { fetchJson } from "./http";
import { crumbFetch } from "./yahoo";
import { addModelDeltas, parseAlpaca, parseYahooResult, runProviders, type ChainResult } from "./options-parse";
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

async function yahooChain(req: ChainRequest): Promise<OptionContract[]> {
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
  const [lo, hi] = strikeWindow(req.type, req.price);
  return all.filter((c) => c.strike >= lo && c.strike <= hi && c.expiration >= isoDay(req.dteMin) && c.expiration <= isoDay(req.dteMax));
}

async function riskFreeRate(): Promise<number> {
  const e = getEnv();
  if (e.RISK_FREE_RATE != null) return e.RISK_FREE_RATE;
  const rf = await getRiskFree();
  return rf.rate ?? 0.04; // last-resort assumption; only used to model delta when the feed has none
}

/** Fetch one side of the chain for a symbol, Alpaca first and Yahoo as backup (or per OPTIONS_PROVIDER). */
export async function fetchOptionChain(req: ChainRequest): Promise<ChainResult> {
  const e = getEnv();
  const providers: Parameters<typeof runProviders>[0] = [];
  if (e.OPTIONS_PROVIDER !== "yahoo") {
    if (alpacaConfigured()) providers.push({ name: "alpaca", fn: () => alpacaChain(req) });
    else if (e.OPTIONS_PROVIDER === "alpaca") providers.push({ name: "alpaca", fn: async () => { throw new Error("ALPACA_API_KEY / ALPACA_SECRET_KEY are not set"); } });
  }
  if (e.OPTIONS_PROVIDER !== "alpaca") providers.push({ name: "yahoo", fn: () => yahooChain(req) });
  if (e.OPTIONS_PROVIDER === "auto" && !alpacaConfigured()) {
    // make the missing-key case visible in the status line instead of silently using Yahoo
    const r = await runProviders(providers);
    return { ...r, fallbackReason: r.fallbackReason ?? "Alpaca keys not configured" };
  }
  return runProviders(providers);
}

/** Cached chain with model deltas filled in where the feed gave none. */
export async function getOptionChain(req: ChainRequest, ttlSec = 120) {
  // Cache provider quotes, not derived Greeks: spot and dividend yield can change between callers.
  const key = `opt:chain:v2:${getEnv().OPTIONS_PROVIDER}:${req.symbol}:${req.type}:${req.dteMin}-${req.dteMax}`;
  const c = await cached(key, ttlSec, () => fetchOptionChain(req));
  const rate = await riskFreeRate();
  const today = new Date().toISOString().slice(0, 10);
  const contracts = addModelDeltas(c.data.contracts, req.price, rate, today, req.divYield ?? 0);
  return { ...c.data, contracts, rate, fetchedAt: c.fetchedAt, stale: c.stale };
}
