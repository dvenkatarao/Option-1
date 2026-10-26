import type { AssetClass } from "./recommend";

export type RateTag = "defensive" | "neutral" | "sensitive";
export type RateBucket = { tag: RateTag; label: string; hint: string; color: string };

/**
 * Duration / rate-sensitivity tag for ETFs.
 * Uses provider category + asset class + allocation only — no price history.
 * Hard-coded ticker overrides cover the curated universe where category strings are noisy.
 */

const TICKER_TAG: Record<string, RateTag> = {
  // Cash-like — benefits from high rates
  BIL: "defensive",
  SGOV: "defensive",
  // Short/intermediate — defensive in tightening
  SHY: "defensive",
  IEI: "defensive",
  VCSH: "defensive",
  SCHZ: "defensive",
  // Long duration — rate sensitive
  TLT: "sensitive",
  IEF: "sensitive",
  VCIT: "sensitive",
  BND: "sensitive",
  AGG: "sensitive",
  BNDX: "sensitive",
  TIP: "neutral", // real yield hedged
  LQD: "neutral",
  HYG: "neutral",
  JNK: "neutral",
  PFF: "neutral",
  // Equity defensive
  SCHD: "defensive",
  VYM: "defensive",
  USMV: "defensive",
  VIG: "defensive",
  DVY: "defensive",
  HDV: "defensive",
  SDY: "defensive",
  NOBL: "defensive",
  SPHD: "defensive",
  // Equity sensitive / growth
  QQQ: "sensitive",
  QQQM: "sensitive",
  SCHG: "sensitive",
  VUG: "sensitive",
  IWF: "sensitive",
  MGK: "sensitive",
  SMH: "sensitive",
  SOXX: "sensitive",
  ARKK: "sensitive",
  VGT: "sensitive",
  // Value / blend neutral
  VOO: "neutral",
  SPY: "neutral",
  IVV: "neutral",
  VTI: "neutral",
  RSP: "neutral",
  DIA: "neutral",
  IWM: "neutral",
  VB: "neutral",
  VTV: "neutral",
  IWD: "neutral",
  SCHV: "neutral",
};

const CAT_PATTERNS: { re: RegExp; tag: RateTag; label: string; hint: string }[] = [
  { re: /money market|ultra.?short|t.?bill|treasury bill|cash/i, tag: "defensive", label: "Cash-like — rates help", hint: "Benefits when short rates are high" },
  { re: /short.?term|1-3 year|0-5 year|short duration/i, tag: "defensive", label: "Short duration — defensive", hint: "Holds up when rates rise" },
  { re: /long.?term|20\+ year|long duration|extended duration/i, tag: "sensitive", label: "Long duration — rates hurt", hint: "Falls when long yields rise" },
  { re: /intermediate|aggregate|core bond|total bond|broad bond/i, tag: "sensitive", label: "Bonds — rates hurt", hint: "Intermediate/long duration" },
  { re: /low volatility|minimum volatility|defensive|dividend (growth|appreciation)/i, tag: "defensive", label: "Defensive equity", hint: "Holds up late-cycle" },
  { re: /growth|momentum|technology|semiconductor|innovation|disrupt/i, tag: "sensitive", label: "Growth — rates hurt", hint: "Long-duration earnings" },
  { re: /value|high dividend|dividend yield/i, tag: "neutral", label: "Value / income — neutral", hint: "Balanced rate fit" },
  { re: /commodit|precious|gold|silver|oil|energy|industrial/i, tag: "neutral", label: "Real assets — neutral", hint: "Inflation-hedge, not rate-driven" },
];

export function rateTagForEtf(input: { ticker: string; category: string | null; name?: string | null; assetClass: AssetClass | null }): RateBucket {
  const t = input.ticker.toUpperCase();
  if (TICKER_TAG[t]) {
    const tag = TICKER_TAG[t]!;
    return bucket(tag);
  }
  const cat = `${input.category ?? ""} ${input.name ?? ""}`;
  for (const p of CAT_PATTERNS) if (p.re.test(cat)) return { tag: p.tag, label: p.label, hint: p.hint, color: colorFor(p.tag) };
  // Fallback by asset class
  if (input.assetClass === "Cash-like") return bucket("defensive");
  if (input.assetClass === "Fixed income") return { tag: "sensitive", label: "Bonds — rates hurt", hint: "Duration risk", color: colorFor("sensitive") };
  if (input.assetClass === "Commodities & crypto") return bucket("neutral");
  return bucket("neutral");
}

function bucket(tag: RateTag): RateBucket {
  if (tag === "defensive") return { tag, label: "Defensive — rates help", hint: "Holds up when rates high", color: colorFor(tag) };
  if (tag === "sensitive") return { tag, label: "Sensitive — rates hurt", hint: "Falls when real yields rise", color: colorFor(tag) };
  return { tag, label: "Neutral — mixed", hint: "Balanced cycle fit", color: colorFor(tag) };
}

function colorFor(tag: RateTag): string {
  if (tag === "defensive") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (tag === "sensitive") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

// Dark variant colors for Wheel
export function rateTagDark(tag: RateTag): string {
  if (tag === "defensive") return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20";
  if (tag === "sensitive") return "bg-rose-500/15 text-rose-300 ring-rose-500/20";
  return "bg-slate-700/60 text-slate-300 ring-slate-600/30";
}
