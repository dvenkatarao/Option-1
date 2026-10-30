/**
 * Wheel-strategy option evaluation (pure, no I/O).
 *
 * Step 1 sells cash-secured puts on stocks you would be happy to own; if assigned you own 100 shares and
 * Step 2 sells covered calls above your cost until the shares are called away.
 * Everything here is arithmetic on quotes the provider returned; nothing is predicted.
 */

export type OptionType = "put" | "call";

export type OptionContract = {
  symbol: string;
  type: OptionType;
  strike: number;
  /** YYYY-MM-DD */
  expiration: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** Calls positive, puts negative. */
  delta: number | null;
  /** "provider" = delta supplied by the data feed; "model" = Black-Scholes from implied volatility. */
  deltaSource: "provider" | "model" | null;
  /** Provider/model provenance for the complete Greek set; "mixed" when both were used. */
  greeksSource?: "provider" | "model" | "mixed" | null;
  gamma?: number | null;
  /** Theta is per calendar day; vega/rho are per 1 percentage point; see greeksSource. */
  theta?: number | null;
  vega?: number | null;
  rho?: number | null;
  /** Implied volatility as a fraction (0.30 = 30%). */
  iv: number | null;
  oi: number | null;
  volume: number | null;
  /** Provider quote timestamp when included in the payload (not the fetch time). */
  quoteTimestamp?: string | null;
  source: "schwab" | "alpaca" | "yahoo";
};

export type StockCtx = {
  ticker: string;
  price: number;
  /** Next earnings date YYYY-MM-DD, or null when the provider has none. */
  nextEarnings: string | null;
  earningsEstimated: boolean;
  exDividend: string | null;
  dividendPerShare: number | null;
  dividendYield: number | null;
  beta: number | null;
  hv30: number | null;
  sma200: number | null;
  /** Support prices (any order). */
  supports: number[];
};

export type WheelParams = {
  deltaMin: number;
  deltaMax: number;
  dteMin: number;
  dteMax: number;
  minOi: number;
  /** (ask - bid) / mid. */
  maxSpreadPct: number;
  /** Minimum annualised return on cash at risk (fraction). */
  minAnnReturn: number;
  /** When false (default) options that expire on/after the next earnings date are rejected. */
  allowEarnings: boolean;
};

export const DEFAULT_PARAMS: WheelParams = {
  deltaMin: 0.15,
  deltaMax: 0.3,
  dteMin: 21,
  dteMax: 50,
  minOi: 100,
  maxSpreadPct: 0.1,
  minAnnReturn: 0.08,
  allowEarnings: false,
};

export type RejectReason = "no-quote" | "itm" | "dte" | "delta" | "oi" | "spread" | "return" | "earnings" | "basis";
export type EarningsStatus = "inside" | "clear" | "unknown";
export type AccountFlag = "R" | "T" | "R/T";
export type AccountFit = { flag: AccountFlag; reasons: string[] };

const MS_DAY = 86_400_000;
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / MS_DAY);
}

export function earningsStatus(nextEarnings: string | null, expiration: string, today: string): EarningsStatus {
  if (!nextEarnings) return "unknown";
  if (nextEarnings < today) return "unknown"; // stale date from the provider
  return nextEarnings <= expiration ? "inside" : "clear";
}

/** Rough "how many standard deviations the market expects the stock to move by expiry". */
const expectedMovePct = (iv: number | null, dte: number) => (iv != null && iv > 0 ? iv * Math.sqrt(Math.max(dte, 0) / 365) : null);

/**
 * Account-type hint. Option premium is taxed as a short-term gain in a taxable account but sheltered in a
 * retirement account, so the richest premiums are best placed there. Volatile stocks go to taxable, where an
 * assignment loss can be deducted (it is wasted inside an IRA). Low-yield trades go to taxable to save
 * limited retirement capacity for better ones. General guidance only, not tax advice.
 */
export function accountFit(annReturn: number, beta: number | null): AccountFit {
  const reasons: string[] = [];
  if (beta != null && beta > 1.3) {
    reasons.push(`High beta (${beta.toFixed(2)}): an assignment loss can be deducted in a taxable account but is wasted inside a retirement account.`);
    return { flag: "T", reasons };
  }
  if (annReturn >= 0.15) {
    reasons.push(`Rich premium (${(annReturn * 100).toFixed(0)}%/yr): in a taxable account it is taxed as short-term gain; a retirement account shelters it.`);
    return { flag: "R", reasons };
  }
  if (annReturn < 0.1) {
    reasons.push(`Modest premium (${(annReturn * 100).toFixed(0)}%/yr): little tax drag, so keep scarce retirement-account room for richer trades.`);
    return { flag: "T", reasons };
  }
  reasons.push(`Middle-of-the-road premium (${(annReturn * 100).toFixed(0)}%/yr): fine in either account type.`);
  return { flag: "R/T", reasons };
}

export type PutCandidate = {
  contract: OptionContract;
  dte: number;
  mid: number;
  /** Realistic limit-order fill: 25% of the way from bid to ask. */
  credit: number;
  spreadPct: number;
  /** Cash that must be set aside per contract. */
  cash: number;
  /** Return on cash at risk if the put expires worthless: credit / (strike - credit). */
  roc: number;
  annRoc: number;
  breakeven: number;
  /** How far the stock can fall before the trade loses money. */
  breakevenCushion: number;
  /** How far below the current price the strike is. */
  otmPct: number;
  probOtm: number;
  expMovePct: number | null;
  /** Strike distance in expected-move units (>= 1 means the strike is outside the market's expected range). */
  sigmaDistance: number | null;
  earnings: EarningsStatus;
  daysToEarnings: number | null;
  exDivInside: boolean;
  ivHv: number | null;
  /** True when a support level sits between the strike and the current price. */
  supportAboveStrike: boolean;
  belowSma200: boolean;
  score: number;
  account: AccountFit;
};

type Eval<T> = { ok: true; cand: T } | { ok: false; reason: RejectReason };

function quote(c: OptionContract): { bid: number; ask: number; mid: number; spreadPct: number; credit: number } | null {
  const { bid, ask } = c;
  if (bid == null || ask == null || !(bid > 0) || !(ask >= bid)) return null;
  const mid = (bid + ask) / 2;
  return { bid, ask, mid, spreadPct: mid > 0 ? (ask - bid) / mid : Infinity, credit: bid + 0.25 * (ask - bid) };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function evaluatePut(c: OptionContract, s: StockCtx, p: WheelParams, today: string): Eval<PutCandidate> {
  const q = quote(c);
  if (!q || c.delta == null) return { ok: false, reason: "no-quote" };
  if (c.strike >= s.price) return { ok: false, reason: "itm" };
  const dte = daysBetween(today, c.expiration);
  if (dte < p.dteMin || dte > p.dteMax || dte <= 0) return { ok: false, reason: "dte" };
  const ad = Math.abs(c.delta);
  if (ad < p.deltaMin || ad > p.deltaMax) return { ok: false, reason: "delta" };
  if (c.oi == null || c.oi < p.minOi) return { ok: false, reason: "oi" };
  if (q.spreadPct > p.maxSpreadPct) return { ok: false, reason: "spread" };
  const earnings = earningsStatus(s.nextEarnings, c.expiration, today);
  if (earnings === "inside" && !p.allowEarnings) return { ok: false, reason: "earnings" };

  const roc = q.credit / (c.strike - q.credit);
  const annRoc = (roc * 365) / dte;
  if (annRoc < p.minAnnReturn) return { ok: false, reason: "return" };

  const em = expectedMovePct(c.iv, dte);
  const sigmaDistance = em != null && em > 0 ? (s.price - c.strike) / s.price / em : null;
  const supportAboveStrike = s.supports.some((x) => x >= c.strike && x < s.price);
  const belowSma200 = s.sma200 != null && s.price < s.sma200;
  const exDivInside = !!s.exDividend && s.exDividend >= today && s.exDividend <= c.expiration;
  const probOtm = 1 - ad;
  const liq = clamp(1 - (0.5 * q.spreadPct) / p.maxSpreadPct, 0.5, 1) * (c.oi >= 500 ? 1 : 0.9);
  const struct = 1 + (supportAboveStrike ? 0.1 : 0) + (sigmaDistance != null && sigmaDistance >= 1 ? 0.1 : 0) - (earnings === "inside" ? 0.3 : 0) - (belowSma200 ? 0.15 : 0);
  const score = Math.min(annRoc, 1) * probOtm * liq * struct * 100;

  return {
    ok: true,
    cand: {
      contract: c,
      dte,
      mid: q.mid,
      credit: q.credit,
      spreadPct: q.spreadPct,
      cash: c.strike * 100,
      roc,
      annRoc,
      breakeven: c.strike - q.credit,
      breakevenCushion: (s.price - (c.strike - q.credit)) / s.price,
      otmPct: (s.price - c.strike) / s.price,
      probOtm,
      expMovePct: em,
      sigmaDistance,
      earnings,
      daysToEarnings: s.nextEarnings ? daysBetween(today, s.nextEarnings) : null,
      exDivInside,
      ivHv: c.iv != null && s.hv30 ? c.iv / s.hv30 : null,
      supportAboveStrike,
      belowSma200,
      score,
      account: accountFit(annRoc, s.beta),
    },
  };
}

export type CallCandidate = {
  contract: OptionContract;
  dte: number;
  mid: number;
  credit: number;
  spreadPct: number;
  /** Premium as a fraction of your cost basis, annualised. */
  annYield: number;
  /** Total return on cost if the shares are called away at the strike: (strike - basis + credit) / basis. */
  ifCalled: number;
  annIfCalled: number;
  /** Distance from the current price up to the strike. */
  upsideToStrike: number;
  /** Time value left in the option: mid - intrinsic. */
  extrinsic: number;
  earnings: EarningsStatus;
  daysToEarnings: number | null;
  exDivInside: boolean;
  /** high = strike within 2% of the price and time value below the dividend; check = an ex-dividend date falls inside the term. */
  earlyAssignmentRisk: "high" | "check" | null;
  score: number;
  account: AccountFit;
};

export function evaluateCall(c: OptionContract, s: StockCtx, basis: number, p: WheelParams, today: string): Eval<CallCandidate> {
  const q = quote(c);
  if (!q || c.delta == null) return { ok: false, reason: "no-quote" };
  if (c.strike < basis) return { ok: false, reason: "basis" };
  if (c.strike < s.price) return { ok: false, reason: "itm" };
  const dte = daysBetween(today, c.expiration);
  if (dte < p.dteMin || dte > p.dteMax || dte <= 0) return { ok: false, reason: "dte" };
  const ad = Math.abs(c.delta);
  if (ad < p.deltaMin || ad > p.deltaMax) return { ok: false, reason: "delta" };
  if (c.oi == null || c.oi < p.minOi) return { ok: false, reason: "oi" };
  if (q.spreadPct > p.maxSpreadPct) return { ok: false, reason: "spread" };
  const earnings = earningsStatus(s.nextEarnings, c.expiration, today);
  if (earnings === "inside" && !p.allowEarnings) return { ok: false, reason: "earnings" };

  const annYield = (q.credit / basis) * (365 / dte);
  if (annYield < p.minAnnReturn) return { ok: false, reason: "return" };
  const ifCalled = (c.strike - basis + q.credit) / basis;
  const extrinsic = q.mid - Math.max(0, s.price - c.strike);
  const exDivInside = !!s.exDividend && s.exDividend >= today && s.exDividend <= c.expiration;
  let early: CallCandidate["earlyAssignmentRisk"] = null;
  // Buyers only exercise early for the dividend when the call is in the money and its time value is below the dividend.
  // Every candidate here starts out of the money, so "high" means: close enough to the price that a small rally gets there.
  if (exDivInside) early = s.dividendPerShare != null && (c.strike - s.price) / s.price <= 0.02 && extrinsic < s.dividendPerShare ? "high" : "check";
  const liq = clamp(1 - (0.5 * q.spreadPct) / p.maxSpreadPct, 0.5, 1) * (c.oi >= 500 ? 1 : 0.9);
  const struct = 1 - (early === "high" ? 0.25 : 0) - (earnings === "inside" ? 0.3 : 0);
  const score = Math.min(annYield, 1) * (0.5 + 0.5 * (1 - ad)) * liq * struct * 100;
  return {
    ok: true,
    cand: {
      contract: c,
      dte,
      mid: q.mid,
      credit: q.credit,
      spreadPct: q.spreadPct,
      annYield,
      ifCalled,
      annIfCalled: (ifCalled * 365) / dte,
      upsideToStrike: (c.strike - s.price) / s.price,
      extrinsic,
      earnings,
      daysToEarnings: s.nextEarnings ? daysBetween(today, s.nextEarnings) : null,
      exDivInside,
      earlyAssignmentRisk: early,
      score,
      account: accountFit(annYield, s.beta),
    },
  };
}

export type PutScan = { candidates: PutCandidate[]; rejected: Partial<Record<RejectReason, number>>; evaluated: number };

/** Evaluate every put in a chain; candidates come back best score first. */
export function scanPuts(chain: OptionContract[], s: StockCtx, p: WheelParams, today: string): PutScan {
  const rejected: PutScan["rejected"] = {};
  const candidates: PutCandidate[] = [];
  let evaluated = 0;
  for (const c of chain) {
    if (c.type !== "put") continue;
    evaluated++;
    const r = evaluatePut(c, s, p, today);
    if (r.ok) candidates.push(r.cand);
    else rejected[r.reason] = (rejected[r.reason] ?? 0) + 1;
  }
  candidates.sort((a, b) => b.score - a.score);
  return { candidates, rejected, evaluated };
}

export type CallScan = { candidates: CallCandidate[]; rejected: Partial<Record<RejectReason, number>>; evaluated: number };

export function scanCalls(chain: OptionContract[], s: StockCtx, basis: number, p: WheelParams, today: string): CallScan {
  const rejected: CallScan["rejected"] = {};
  const candidates: CallCandidate[] = [];
  let evaluated = 0;
  for (const c of chain) {
    if (c.type !== "call") continue;
    evaluated++;
    const r = evaluateCall(c, s, basis, p, today);
    if (r.ok) candidates.push(r.cand);
    else rejected[r.reason] = (rejected[r.reason] ?? 0) + 1;
  }
  candidates.sort((a, b) => b.score - a.score);
  return { candidates, rejected, evaluated };
}

export const REJECT_LABEL: Record<RejectReason, string> = {
  "no-quote": "no usable quote or delta",
  itm: "in the money",
  dte: "outside expiry window",
  delta: "outside delta range",
  oi: "open interest too low",
  spread: "bid/ask gap too wide",
  return: "annual return too low",
  earnings: "expires after earnings",
  basis: "strike below your cost",
};
