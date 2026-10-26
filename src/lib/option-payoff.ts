/**
 * Expiration P&L for listed equity options (100-share multiplier).
 * European-style intrinsic at expiry; ignores early exercise, fees, and assignment timing.
 */

export type Right = "put" | "call" | "stock";
export type Side = "buy" | "sell";

export type Leg = {
  id: string;
  side: Side;
  right: Right;
  /** Null only for stock. */
  strike: number | null;
  /** Per-share premium (or stock entry price). */
  premium: number;
  /** Contracts, or 100-share lots for stock. */
  qty: number;
};

export type PayoffSummary = {
  netCredit: number;
  maxProfit: number | null;
  maxLoss: number | null;
  profitUnbounded: boolean;
  lossUnbounded: boolean;
  breakevens: number[];
  capital: number;
  roc: number | null;
  rewardRisk: number | null;
  points: { price: number; pnl: number }[];
  atSpot: number;
};

export function intrinsic(right: Right, strike: number | null, spot: number): number {
  if (right === "stock" || strike == null) return 0;
  return right === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
}

/** P&L per share at expiration (stock uses premium as entry). */
export function legPnlPerShare(leg: Leg, spot: number): number {
  if (!(leg.qty > 0)) return 0;
  if (leg.right === "stock") {
    const dir = leg.side === "buy" ? 1 : -1;
    return dir * (spot - leg.premium);
  }
  const sign = leg.side === "sell" ? 1 : -1;
  return sign * (leg.premium - intrinsic(leg.right, leg.strike, spot));
}

export function positionPnl(legs: Leg[], spot: number): number {
  return legs.reduce((s, l) => s + legPnlPerShare(l, spot) * 100 * l.qty, 0);
}

/** Positive = net credit collected (option legs only). */
export function netCredit(legs: Leg[]): number {
  return legs
    .filter((l) => l.right !== "stock")
    .reduce((s, l) => s + (l.side === "sell" ? 1 : -1) * l.premium * 100 * l.qty, 0);
}

function optionStrikes(legs: Leg[]): number[] {
  return legs.map((l) => l.strike).filter((x): x is number => x != null && x > 0);
}

export function samplePrices(legs: Leg[], spot: number, n = 241): number[] {
  const ks = optionStrikes(legs);
  const lo = Math.max(0, Math.min(spot * 0.55, ...(ks.length ? ks : [spot])) * 0.75);
  const hi = Math.max(spot * 1.45, ...(ks.length ? ks : [spot])) * 1.25;
  if (!(hi > lo) || n < 3) return [Math.max(0, spot)];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(lo + ((hi - lo) * i) / (n - 1));
  // include 0 so cash-secured put max-loss is visible
  if (out[0] > 0.5) out.unshift(0);
  return out;
}

export function breakevens(prices: number[], pnls: number[]): number[] {
  const bes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = pnls[i - 1];
    const b = pnls[i];
    if (a === 0) {
      if (bes[bes.length - 1] !== prices[i - 1]) bes.push(prices[i - 1]);
      continue;
    }
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const t = a / (a - b);
      bes.push(prices[i - 1] + t * (prices[i] - prices[i - 1]));
    }
  }
  const rounded = bes.map((x) => Math.round(x * 100) / 100);
  return rounded.filter((x, i) => i === 0 || Math.abs(x - rounded[i - 1]) > 0.02);
}

function hasNakedShort(legs: Leg[], right: Right): boolean {
  const sold = legs.filter((l) => l.right === right && l.side === "sell").reduce((s, l) => s + l.qty, 0);
  const bought = legs.filter((l) => l.right === right && l.side === "buy").reduce((s, l) => s + l.qty, 0);
  const stock = legs.filter((l) => l.right === "stock" && l.side === "buy").reduce((s, l) => s + l.qty, 0);
  if (right === "call") return sold > bought + stock;
  return sold > bought;
}

export function summarizePayoff(legs: Leg[], spot: number): PayoffSummary {
  const usable = legs.filter((l) => l.qty > 0 && l.premium >= 0 && (l.right === "stock" || (l.strike != null && l.strike > 0)));
  const prices = samplePrices(usable, spot);
  const pnls = prices.map((p) => positionPnl(usable, p));
  const at0 = positionPnl(usable, 0);
  const far = Math.max(spot * 4, ...optionStrikes(usable).map((k) => k * 3), 1);
  const atFar = positionPnl(usable, far);
  const interiorMax = Math.max(...pnls, at0, atFar);
  const interiorMin = Math.min(...pnls, at0, atFar);
  const profitUnbounded = hasNakedShort(usable, "put") === false && atFar > interiorMax - 1 && atFar - positionPnl(usable, far * 0.8) > 50;
  // long call / long stock: pnl keeps rising
  const rising = atFar - positionPnl(usable, far * 0.85) > 50;
  const falling = positionPnl(usable, far * 0.85) - atFar > 50;
  const profitUp = rising && !hasNakedShort(usable, "call");
  const lossUp = falling && hasNakedShort(usable, "call");
  const lossDown = hasNakedShort(usable, "put") && at0 <= interiorMin + 1;

  const maxProfit = profitUp || profitUnbounded ? null : interiorMax;
  const maxLoss = lossUp || lossDown ? (lossDown && !lossUp ? at0 : null) : interiorMin;
  // cash-secured put: loss is defined at 0
  const definedLoss = lossDown ? at0 : maxLoss;

  const credit = netCredit(usable);
  const capital = definedLoss != null && definedLoss < 0 ? Math.abs(definedLoss) : Math.max(0, -Math.min(0, interiorMin));
  const roc = capital > 0 && credit > 0 ? credit / capital : credit < 0 && definedLoss != null ? null : null;
  const reward = maxProfit != null ? Math.max(0, maxProfit) : null;
  const risk = definedLoss != null ? Math.abs(Math.min(0, definedLoss)) : null;

  return {
    netCredit: credit,
    maxProfit: profitUp ? null : maxProfit,
    maxLoss: lossUp ? null : definedLoss,
    profitUnbounded: profitUp,
    lossUnbounded: lossUp,
    breakevens: breakevens(prices, pnls),
    capital,
    roc: reward != null && risk != null && risk > 0 && credit > 0 ? credit / risk : roc,
    rewardRisk: reward != null && risk != null && risk > 0 ? reward / risk : null,
    points: prices.map((price, i) => ({ price, pnl: pnls[i] })),
    atSpot: positionPnl(usable, spot),
  };
}

export type PresetId = "short-put" | "covered-call" | "put-credit" | "call-credit" | "iron-condor";

export const PRESET_META: { id: PresetId; label: string; desc: string; risk: "defined" | "undefined" | "covered" }[] = [
  { id: "short-put", label: "Cash-secured put", desc: "Collect premium while waiting to buy a stock you want", risk: "undefined" },
  { id: "covered-call", label: "Covered call", desc: "Income on 100 shares; upside capped at the short call", risk: "covered" },
  { id: "put-credit", label: "Put credit spread", desc: "Bullish defined-risk cousin of the cash-secured put", risk: "defined" },
  { id: "call-credit", label: "Call credit spread", desc: "Bearish defined-risk; long call stops the loss", risk: "defined" },
  { id: "iron-condor", label: "Iron condor", desc: "Range-bound; long wings cap both sides", risk: "defined" },
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function roundStrike(x: number): number {
  if (x >= 200) return Math.round(x);
  if (x >= 50) return Math.round(x * 2) / 2;
  return Math.round(x * 4) / 4;
}

export function presetLegs(id: PresetId, spot: number, premium = 1): Leg[] {
  const k = roundStrike(spot);
  const putShort = roundStrike(spot * 0.95);
  const putLong = roundStrike(spot * 0.9);
  const callShort = roundStrike(spot * 1.05);
  const callLong = roundStrike(spot * 1.1);
  const p = Math.max(0.05, premium);
  const wing = Math.max(0.05, p * 0.55);
  switch (id) {
    case "short-put":
      return [{ id: uid("sp"), side: "sell", right: "put", strike: putShort, premium: p, qty: 1 }];
    case "covered-call":
      return [
        { id: uid("st"), side: "buy", right: "stock", strike: null, premium: k, qty: 1 },
        { id: uid("cc"), side: "sell", right: "call", strike: callShort, premium: p, qty: 1 },
      ];
    case "put-credit":
      return [
        { id: uid("ps"), side: "sell", right: "put", strike: putShort, premium: p, qty: 1 },
        { id: uid("pl"), side: "buy", right: "put", strike: putLong, premium: wing, qty: 1 },
      ];
    case "call-credit":
      return [
        { id: uid("cs"), side: "sell", right: "call", strike: callShort, premium: p, qty: 1 },
        { id: uid("cl"), side: "buy", right: "call", strike: callLong, premium: wing, qty: 1 },
      ];
    case "iron-condor":
      return [
        { id: uid("ps"), side: "sell", right: "put", strike: putShort, premium: p, qty: 1 },
        { id: uid("pl"), side: "buy", right: "put", strike: putLong, premium: wing, qty: 1 },
        { id: uid("cs"), side: "sell", right: "call", strike: callShort, premium: p, qty: 1 },
        { id: uid("cl"), side: "buy", right: "call", strike: callLong, premium: wing, qty: 1 },
      ];
  }
}

export type ChainQuote = { type: "put" | "call"; strike: number; expiration: string; bid: number | null; ask: number | null; iv: number | null; delta: number | null; oi: number | null };

export function fillPrice(q: { bid: number | null; ask: number | null }, side: Side): number | null {
  const { bid, ask } = q;
  if (bid == null || ask == null || !(bid > 0) || !(ask >= bid)) return null;
  // sell at 25% of the way from bid to ask; buy at 75%
  const t = side === "sell" ? 0.25 : 0.75;
  return bid + t * (ask - bid);
}

export function nearestQuote(chain: ChainQuote[], type: "put" | "call", targetStrike: number, expiration?: string): ChainQuote | null {
  const pool = chain.filter((c) => c.type === type && (expiration ? c.expiration === expiration : true));
  if (!pool.length) return null;
  return pool.reduce((best, c) => (Math.abs(c.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? c : best));
}

export function applyQuotes(legs: Leg[], chain: ChainQuote[], expiration?: string): Leg[] {
  return legs.map((l) => {
    if (l.right === "stock" || l.strike == null) return l;
    const q = nearestQuote(chain, l.right, l.strike, expiration);
    if (!q) return l;
    const px = fillPrice(q, l.side);
    return { ...l, strike: q.strike, premium: px ?? l.premium };
  });
}
