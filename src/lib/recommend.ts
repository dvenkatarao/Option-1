import type { ScreenRow } from "@/types/liveScreener";

export type Goal = "income" | "growth" | "lowcost" | "defensive" | "balanced";
export type Metric = "expense" | "yieldTtm" | "aum" | "r3y" | "r5y" | "vol3y" | "dd3y" | "sharpe" | "priceRet3y" | "divCagr3y" | "analystRec";

export type Weight = { metric: Metric; label: string; w: number; higherIsBetter: boolean; /** Overrides the "(higher/lower is better)" text where that wording would mislead. */ hint?: string };

export const GOALS: Record<Goal, { label: string; description: string; weights: Weight[] }> = {
  income: {
    label: "Income",
    description: "Rewards high trailing distribution yield, but only when total return holds up and the share price is not decaying.",
    weights: [
      { metric: "yieldTtm", label: "TTM yield", w: 0.3, higherIsBetter: true },
      { metric: "r3y", label: "3Y total return (ann.)", w: 0.25, higherIsBetter: true },
      { metric: "priceRet3y", label: "3Y price return (NAV-erosion check)", w: 0.2, higherIsBetter: true },
      { metric: "divCagr3y", label: "3Y distribution CAGR", w: 0.15, higherIsBetter: true },
      { metric: "expense", label: "Expense ratio", w: 0.1, higherIsBetter: false },
    ],
  },
  growth: {
    label: "Growth",
    description: "Rewards strong multi-year total return with good risk-adjusted performance and contained drawdowns.",
    weights: [
      { metric: "r3y", label: "3Y total return (ann.)", w: 0.3, higherIsBetter: true },
      { metric: "r5y", label: "5Y total return (ann.)", w: 0.25, higherIsBetter: true },
      { metric: "sharpe", label: "Sharpe 3Y", w: 0.2, higherIsBetter: true },
      { metric: "dd3y", label: "Max drawdown 3Y", w: 0.15, higherIsBetter: true, hint: "shallower drawdown is better" },
      { metric: "expense", label: "Expense ratio", w: 0.1, higherIsBetter: false },
    ],
  },
  lowcost: {
    label: "Low-cost core",
    description: "Rewards cheap, large, liquid funds with solid long-run returns and moderate volatility.",
    weights: [
      { metric: "expense", label: "Expense ratio", w: 0.4, higherIsBetter: false },
      { metric: "aum", label: "Assets under management", w: 0.25, higherIsBetter: true },
      { metric: "r5y", label: "5Y total return (ann.)", w: 0.2, higherIsBetter: true },
      { metric: "vol3y", label: "Volatility 3Y", w: 0.15, higherIsBetter: false },
    ],
  },
  defensive: {
    label: "Defensive / low volatility",
    description: "Rewards low volatility and shallow drawdowns, with credit for risk-adjusted return and income.",
    weights: [
      { metric: "vol3y", label: "Volatility 3Y", w: 0.35, higherIsBetter: false },
      { metric: "dd3y", label: "Max drawdown 3Y", w: 0.35, higherIsBetter: true, hint: "shallower drawdown is better" },
      { metric: "sharpe", label: "Sharpe 3Y", w: 0.2, higherIsBetter: true },
      { metric: "yieldTtm", label: "TTM yield", w: 0.1, higherIsBetter: true },
    ],
  },
  balanced: {
    label: "Balanced total return",
    description: "Equal-minded blend of risk-adjusted return, absolute return, cost, drawdown and income.",
    weights: [
      { metric: "sharpe", label: "Sharpe 3Y", w: 0.35, higherIsBetter: true },
      { metric: "r3y", label: "3Y total return (ann.)", w: 0.2, higherIsBetter: true },
      { metric: "expense", label: "Expense ratio", w: 0.15, higherIsBetter: false },
      { metric: "dd3y", label: "Max drawdown 3Y", w: 0.15, higherIsBetter: true, hint: "shallower drawdown is better" },
      { metric: "yieldTtm", label: "TTM yield", w: 0.15, higherIsBetter: true },
    ],
  },
};


/** Every metric the score can use, with its fixed direction. Users can re-weight any of them. */
export const METRICS: Record<Metric, { label: string; higherIsBetter: boolean; hint?: string }> = {
  sharpe: { label: "Sharpe 3Y", higherIsBetter: true },
  r3y: { label: "3Y total return (ann.)", higherIsBetter: true },
  r5y: { label: "5Y total return (ann.)", higherIsBetter: true },
  expense: { label: "Expense ratio", higherIsBetter: false },
  dd3y: { label: "Max drawdown 3Y", higherIsBetter: true, hint: "shallower drawdown is better" },
  vol3y: { label: "Volatility 3Y", higherIsBetter: false },
  yieldTtm: { label: "TTM yield", higherIsBetter: true },
  divCagr3y: { label: "3Y distribution CAGR", higherIsBetter: true },
  priceRet3y: { label: "3Y price return (NAV-erosion check)", higherIsBetter: true },
  aum: { label: "Assets under management", higherIsBetter: true },
  analystRec: { label: "Holdings-weighted analyst consensus (1=strong buy, 5=sell)", higherIsBetter: false },
};
export const METRIC_KEYS = Object.keys(METRICS) as Metric[];

/**
 * Weights actually used: the goal's published defaults, or the user's custom weights (0-100 each,
 * any metric) normalised to sum to 1. Falls back to the defaults if the custom set is empty/all zero.
 */
export function resolveWeights(goal: Goal, custom?: Partial<Record<Metric, number>> | null): Weight[] {
  if (custom) {
    const entries = METRIC_KEYS.map((m) => [m, Math.max(0, Number(custom[m]) || 0)] as const).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total > 0) {
      return entries.map(([m, v]) => ({ metric: m, label: METRICS[m].label, w: v / total, higherIsBetter: METRICS[m].higherIsBetter, hint: METRICS[m].hint }));
    }
  }
  return GOALS[goal].weights;
}

export type AssetClass = "Equity" | "Fixed income" | "Commodities & crypto" | "Cash-like" | "Other";

/**
 * Broad asset class from provider data only: category text for commodity/crypto, otherwise the fund's
 * reported holdings allocation (stock/bond/cash %), otherwise category text. Never guessed beyond that.
 */
export function assetClassOf(
  category: string | null | undefined,
  alloc: { stock: number | null; bond: number | null; cash: number | null; other: number | null } | null | undefined,
): AssetClass {
  const cat = (category ?? "").toLowerCase();
  if (/commodit|precious|gold|silver|digital asset|crypto|bitcoin|ether/.test(cat)) return "Commodities & crypto";
  if (/money market|ultrashort|ultra-short|t-bill|treasury bill/.test(cat)) return "Cash-like";
  if (alloc) {
    if ((alloc.bond ?? 0) >= 0.5) return "Fixed income";
    if ((alloc.stock ?? 0) >= 0.5) return "Equity";
    if ((alloc.cash ?? 0) >= 0.5) return "Cash-like";
  }
  if (/bond|treasury|government|credit|inflation-protected|high yield|muni|preferred|income fund/.test(cat)) return "Fixed income";
  if (cat) return "Equity";
  return "Other";
}

export type Scored = {
  row: ScreenRow;
  score: number;
  coverage: number;
  parts: { label: string; rank: number; value: number; weight: number }[];
};

function percentileRank(sorted: number[], v: number) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] < v) lo = m + 1;
    else hi = m;
  }
  let eq = lo;
  while (eq < sorted.length && sorted[eq] === v) eq++;
  return (lo + (eq - lo) / 2) / sorted.length;
}

/**
 * Percentile-rank each metric within a peer group, weight, and require >=70% of the weight to have real data.
 * `peerKey` decides who is ranked against whom: omit for one pool, or pass e.g. r => r.assetClass to rank
 * within asset class (so bond funds are compared with bond funds, not with equity funds).
 * Groups with fewer than 5 funds for a metric cannot rank that metric; funds then lack coverage and drop out.
 */
export function scoreGoal(
  rows: ScreenRow[],
  goal: Goal,
  opts: { weights?: Weight[]; peerKey?: (r: ScreenRow) => string } = {},
): Scored[] {
  const weights = opts.weights ?? GOALS[goal].weights;
  const groups = new Map<string, ScreenRow[]>();
  for (const r of rows) {
    const k = opts.peerKey ? opts.peerKey(r) : "all";
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const out: Scored[] = [];
  for (const peers of groups.values()) {
    const sortedByMetric = new Map<Metric, number[]>();
    for (const w of weights) {
      const vals = peers.map((r) => r[w.metric]).filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
      sortedByMetric.set(w.metric, vals);
    }
    for (const row of peers) {
      let got = 0;
      let acc = 0;
      const parts: Scored["parts"] = [];
      for (const w of weights) {
        const v = row[w.metric];
        const sorted = sortedByMetric.get(w.metric)!;
        if (typeof v !== "number" || !Number.isFinite(v) || sorted.length < 5) continue;
        const pr = percentileRank(sorted, v);
        const rank = w.higherIsBetter ? pr : 1 - pr;
        got += w.w;
        acc += w.w * rank;
        parts.push({ label: w.label, rank, value: v, weight: w.w });
      }
      if (got < 0.7) continue;
      out.push({ row, score: (acc / got) * 100, coverage: got, parts });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
