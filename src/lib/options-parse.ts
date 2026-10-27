/**
 * Pure parsers that turn provider payloads into OptionContract[] (no I/O, unit-tested with fixtures).
 *
 * Alpaca: market data `snapshots` (quote, greeks, implied volatility) joined with trading `option_contracts` (open interest).
 * Yahoo:  v7/finance/options (quote, implied volatility, open interest; NO greeks - delta is modelled afterwards).
 */
import { bsGreeks } from "./bs";
import { daysBetween, type OptionContract, type OptionType } from "./wheel";

const num = (x: unknown): number | null => {
  const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** OCC symbol, e.g. AAPL251121P00207500 -> { underlying, expiration: 2025-11-21, type: put, strike: 207.5 }. */
export function parseOcc(sym: string): { underlying: string; expiration: string; type: OptionType; strike: number } | null {
  const m = /^([A-Z.\-]{1,6})(\d{2})(\d{2})(\d{2})([PC])(\d{8})$/.exec(sym);
  if (!m) return null;
  return { underlying: m[1], expiration: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === "P" ? "put" : "call", strike: Number(m[6]) / 1000 };
}

type AlpacaSnap = {
  latestQuote?: { bp?: number; ap?: number; t?: string };
  latestTrade?: { p?: number };
  dailyBar?: { v?: number };
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number; rho?: number };
  impliedVolatility?: number;
};
type AlpacaContract = { symbol: string; expiration_date?: string; strike_price?: string | number; type?: string; open_interest?: string | number | null };

/** Join Alpaca snapshots (keyed by OCC symbol) with trading-API contracts. Contracts without a snapshot are dropped. */
export function parseAlpaca(snapshots: Record<string, AlpacaSnap>, contracts: AlpacaContract[]): OptionContract[] {
  const out: OptionContract[] = [];
  for (const k of contracts) {
    const snap = snapshots[k.symbol];
    if (!snap) continue;
    const occ = parseOcc(k.symbol);
    const strike = num(k.strike_price) ?? occ?.strike ?? null;
    const expiration = k.expiration_date ?? occ?.expiration ?? null;
    const type = (k.type === "put" || k.type === "call" ? k.type : occ?.type) ?? null;
    if (strike == null || !expiration || !type) continue;
    const delta = num(snap.greeks?.delta);
    const greekValues = {
      gamma: num(snap.greeks?.gamma),
      theta: num(snap.greeks?.theta),
      vega: num(snap.greeks?.vega),
      rho: num(snap.greeks?.rho),
    };
    const hasGreeks = delta != null || Object.values(greekValues).some((value) => value != null);
    out.push({
      symbol: k.symbol,
      type,
      strike,
      expiration,
      bid: num(snap.latestQuote?.bp),
      ask: num(snap.latestQuote?.ap),
      last: num(snap.latestTrade?.p),
      delta,
      deltaSource: delta != null ? "provider" : null,
      greeksSource: hasGreeks ? "provider" : null,
      ...greekValues,
      iv: num(snap.impliedVolatility),
      oi: num(k.open_interest),
      volume: num(snap.dailyBar?.v),
      quoteTimestamp: snap.latestQuote?.t ?? null,
      source: "alpaca",
    });
  }
  return out;
}

type YahooOpt = {
  contractSymbol?: string;
  strike?: number;
  expiration?: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
};

/** Yahoo reports ~0.00001 as the IV of contracts it cannot price; treat anything under 2% as missing. */
const usableIv = (x: unknown) => {
  const n = num(x);
  return n != null && n >= 0.02 ? n : null;
};

export function parseYahooSide(list: YahooOpt[] | undefined, type: OptionType): OptionContract[] {
  const out: OptionContract[] = [];
  for (const o of list ?? []) {
    const strike = num(o.strike);
    const exp = num(o.expiration);
    if (strike == null || exp == null || !o.contractSymbol) continue;
    out.push({
      symbol: o.contractSymbol,
      type,
      strike,
      expiration: new Date(exp * 1000).toISOString().slice(0, 10),
      bid: num(o.bid),
      ask: num(o.ask),
      last: num(o.lastPrice),
      delta: null,
      deltaSource: null,
      iv: usableIv(o.impliedVolatility),
      oi: num(o.openInterest),
      volume: num(o.volume),
      source: "yahoo",
    });
  }
  return out;
}

/** Pulls the expiration list and the first chain out of a Yahoo v7/options response. */
export function parseYahooResult(json: unknown, type: OptionType): { expirations: number[]; contracts: OptionContract[]; price: number | null } {
  const r = (json as { optionChain?: { result?: { expirationDates?: number[]; quote?: { regularMarketPrice?: number }; options?: { calls?: YahooOpt[]; puts?: YahooOpt[] }[] }[] } })?.optionChain?.result?.[0];
  if (!r) throw new Error("Yahoo options: empty response");
  const side = r.options?.[0];
  return {
    expirations: r.expirationDates ?? [],
    price: num(r.quote?.regularMarketPrice),
    contracts: parseYahooSide(type === "put" ? side?.puts : side?.calls, type),
  };
}

/**
 * Fill missing Greeks with a European Black-Scholes model from each contract's IV.
 * Provider values are never overwritten. Delta remains null when IV is unavailable.
 */
export function addModelDeltas(contracts: OptionContract[], spot: number, rate: number, today: string, divYield = 0): OptionContract[] {
  return contracts.map((c) => {
    if (c.iv == null) return c;
    const days = daysBetween(today, c.expiration);
    const model = bsGreeks({ type: c.type, spot, strike: c.strike, years: days / 365, iv: c.iv, rate, divYield });
    if (!model) return c;
    const usedProvider = c.deltaSource === "provider" || c.greeksSource === "provider";
    const usedModel = c.delta == null || c.gamma == null || c.theta == null || c.vega == null || c.rho == null;
    return {
      ...c,
      delta: c.delta ?? model.delta,
      deltaSource: c.delta != null ? c.deltaSource : "model",
      gamma: c.gamma ?? model.gamma,
      theta: c.theta ?? model.theta,
      vega: c.vega ?? model.vega,
      rho: c.rho ?? model.rho,
      greeksSource: usedProvider && usedModel ? "mixed" : usedProvider ? "provider" : "model",
    };
  });
}

/** True when at least one contract carries a two-sided quote; used to detect an empty/closed-market feed and fail over. */
export const hasUsableQuotes = (cs: OptionContract[]) => cs.some((c) => c.bid != null && c.ask != null && c.ask >= c.bid && c.ask > 0);

export type ChainSource = "alpaca" | "yahoo";
export type ChainResult = { contracts: OptionContract[]; source: ChainSource; /** Why the primary provider was skipped, when a backup answered. */ fallbackReason: string | null };

/**
 * Try providers in order; the first that returns a chain with usable quotes wins.
 * Every failure is remembered so the UI can say honestly why the backup was used.
 */
export async function runProviders(providers: { name: ChainSource; fn: () => Promise<OptionContract[]> }[]): Promise<ChainResult> {
  const failures: string[] = [];
  for (const p of providers) {
    try {
      const contracts = await p.fn();
      if (!contracts.length) throw new Error("returned no contracts");
      if (!hasUsableQuotes(contracts)) throw new Error("returned no two-sided quotes");
      return { contracts, source: p.name, fallbackReason: failures.length ? failures.join("; ") : null };
    } catch (e) {
      failures.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(failures.length ? failures.join(" | ") : "no option-chain provider is configured");
}
