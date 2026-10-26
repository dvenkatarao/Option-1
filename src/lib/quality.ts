import type { EtfRow } from "./etf-service";
import { isLeveragedOrInverse } from "./format";
import { GRADE_WORD, gradeFor, worseGrade, type QualityGrade } from "./grades";
import { assetClassOf, type AssetClass } from "./recommend";
import { usableSpread, type SpreadStat } from "./spread";
import type { YahooQuote } from "./yahoo";

/**
 * Fund quality grade (A-F): is this a well-built, cheap, liquid, durable product?
 * It deliberately says nothing about whether the fund will go up. Performance lives elsewhere.
 *
 * Five pillars scored 0-100 on FIXED bands (so an "A" means the same thing whatever the universe looks like).
 * The bands are opinions and are listed below in one place. Hard caps (leveraged, tiny, very young) limit the
 * final grade regardless of score. Missing data is never guessed: unavailable pillars are dropped and the weights
 * renormalised; below 70% weight coverage no grade is issued.
 */

export const QUALITY_WEIGHTS = { cost: 0.3, scale: 0.2, liquidity: 0.2, diversification: 0.15, income: 0.15 } as const;
export const MIN_COVERAGE = 0.7;
export const INCOME_YIELD_THRESHOLD = 0.04; // "income-oriented": TTM yield at or above 4%
export const SMALL_AUM = 1e8;
export const YOUNG_YEARS = 2;

type Pt = [x: number, score: number];

/** Piecewise-linear interpolation, clamped to the first/last point. Works for rising or falling bands. */
export function interp(pts: Pt[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}
const logBands = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [Math.log10(x), y]);
const interpLog = (pts: Pt[], x: number) => (x > 0 ? interp(logBands(pts), Math.log10(x)) : 0);

/** Annual expense ratio (fraction) -> score, per asset class. */
export const COST_BANDS: Record<AssetClass, Pt[]> = {
  Equity: [[0.001, 100], [0.002, 90], [0.004, 65], [0.0075, 25], [0.01, 0]],
  "Fixed income": [[0.001, 100], [0.0025, 80], [0.005, 45], [0.009, 0]],
  "Commodities & crypto": [[0.0025, 100], [0.004, 85], [0.0075, 50], [0.0125, 0]],
  "Cash-like": [[0.0015, 100], [0.003, 70], [0.006, 0]],
  Other: [[0.001, 100], [0.002, 90], [0.004, 65], [0.0075, 25], [0.01, 0]],
};
export const AUM_BANDS: Pt[] = [[5e7, 0], [1e8, 25], [5e8, 60], [1e9, 75], [5e9, 90], [1e10, 100]];
export const AGE_BANDS: Pt[] = [[0, 0], [1, 20], [2, 40], [3, 60], [5, 85], [8, 100]];
export const DOLLAR_VOLUME_BANDS: Pt[] = [[1e5, 0], [1e6, 30], [5e6, 60], [2e7, 80], [1e8, 95], [5e8, 100]];
export const SPREAD_BANDS: Pt[] = [[0.0001, 100], [0.0003, 90], [0.0005, 80], [0.001, 60], [0.0025, 30], [0.005, 0]];
export const TOP10_BANDS: Pt[] = [[0.2, 100], [0.35, 85], [0.5, 60], [0.65, 30], [0.85, 0]];
export const EROSION_SCORE: Record<string, number> = { None: 100, Mild: 70, Moderate: 35, Severe: 0 };

export type QualityInput = {
  assetClass: AssetClass;
  category: string | null;
  name: string | null;
  leveraged: boolean;
  expense: number | null;
  aum: number | null;
  inceptionDate: string | null;
  /** First price bar: used for age only when the inception date is missing (a lower bound, never too young). */
  firstBar: string | null;
  avgDollarVolume: number | null;
  /** Median relative spread, only when enough samples exist (see usableSpread). */
  spreadMedianRel: number | null;
  /** Sum of the top-10 holding weights (fraction), null if fewer than 5 weights are known. */
  top10Weight: number | null;
  yieldTtm: number | null;
  erosionLevel: string;
  now?: Date;
};

export type Pillar = {
  key: keyof typeof QUALITY_WEIGHTS;
  label: string;
  weight: number;
  score: number | null;
  status: "scored" | "not applicable" | "no data";
  detail: string;
};

export type QualityResult = {
  grade: QualityGrade | null;
  /** Weighted score 0-100 over the pillars that have data; null when not enough data. */
  score: number | null;
  /** The grade before hard caps were applied. */
  rawGrade: QualityGrade | null;
  /** Share of total pillar weight that had data (0-1). */
  coverage: number;
  pillars: Pillar[];
  caps: string[];
  notes: string[];
  strengths: string[];
  weaknesses: string[];
  summary: string;
};

/* ---------- formatting helpers (plain English) ---------- */
const usd = (x: number) =>
  x >= 1e12 ? `$${(x / 1e12).toFixed(1)} trillion` : x >= 1e9 ? `$${(x / 1e9).toFixed(1)} billion` : x >= 1e6 ? `$${Math.round(x / 1e6)} million` : `$${Math.round(x).toLocaleString("en-US")}`;
const pc = (x: number, dp = 2) => `${(x * 100).toFixed(dp)}%`;
const yrs = (y: number) => (y < 1 ? `${Math.max(0, Math.round(y * 12))} months` : `${y.toFixed(y < 10 ? 1 : 0)} years`);
const word = (s: number, labels: [string, string, string, string]) => (s >= 85 ? labels[0] : s >= 65 ? labels[1] : s >= 40 ? labels[2] : labels[3]);

const OPTION_INCOME = /(covered call|buy-?write|option income|premium income|0dte|yieldmax|enhanced dividend income|income strategy)/i;
export const isOptionIncome = (category: string | null, name: string | null) => /derivative income/i.test(category ?? "") || OPTION_INCOME.test(name ?? "");

export function ageYears(inceptionDate: string | null, firstBar: string | null, now: Date): number | null {
  for (const s of [inceptionDate, firstBar]) {
    if (!s) continue;
    const t = Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(t)) return Math.max(0, (now.getTime() - t) / (365.25 * 86400000));
  }
  return null;
}

export function computeQuality(i: QualityInput): QualityResult {
  const now = i.now ?? new Date();
  const W = QUALITY_WEIGHTS;
  const fin = (x: number | null): x is number => typeof x === "number" && Number.isFinite(x);
  const pillars: Pillar[] = [];

  // 1. Cost
  if (fin(i.expense) && i.expense >= 0) {
    const s = interp(COST_BANDS[i.assetClass] ?? COST_BANDS.Other, i.expense);
    pillars.push({ key: "cost", label: "Cost", weight: W.cost, score: s, status: "scored", detail: `Charges ${pc(i.expense)} a year, ${word(s, ["very low", "reasonable", "on the high side", "expensive"])} for ${i.assetClass.toLowerCase()} funds.` });
  } else pillars.push({ key: "cost", label: "Cost", weight: W.cost, score: null, status: "no data", detail: "Expense ratio not available." });

  // 2. Scale and staying power (needs both assets and age)
  const age = ageYears(i.inceptionDate, i.firstBar, now);
  if (fin(i.aum) && age != null) {
    const a = interpLog(AUM_BANDS, i.aum);
    const g = interp(AGE_BANDS, age);
    const s = 0.6 * a + 0.4 * g;
    pillars.push({ key: "scale", label: "Size & track record", weight: W.scale, score: s, status: "scored", detail: `Manages ${usd(i.aum)} and has existed for ${yrs(age)}. ${word(s, ["Large and well established.", "Reasonably large and established.", "Small or fairly new.", "Very small or very new, so a higher chance it is closed."])}` });
  } else pillars.push({ key: "scale", label: "Size & track record", weight: W.scale, score: null, status: "no data", detail: "Needs both fund size and launch date." });

  // 3. Liquidity: dollar volume, plus real spread once enough samples are stored
  if (fin(i.avgDollarVolume) && i.avgDollarVolume > 0) {
    const v = interpLog(DOLLAR_VOLUME_BANDS, i.avgDollarVolume);
    const sp = fin(i.spreadMedianRel) ? interp(SPREAD_BANDS, i.spreadMedianRel) : null;
    const s = sp != null ? 0.5 * v + 0.5 * sp : v;
    const spreadText = sp != null && fin(i.spreadMedianRel) ? ` The typical gap between buy and sell prices is ${pc(i.spreadMedianRel, 3)}.` : " Buy/sell price gap not measured yet (history is still building).";
    pillars.push({ key: "liquidity", label: "Ease of trading", weight: W.liquidity, score: s, status: "scored", detail: `About ${usd(i.avgDollarVolume)} changes hands on an average day, ${word(v, ["very easy to trade", "easy to trade", "somewhat thin", "thinly traded"])}.${spreadText}` });
  } else pillars.push({ key: "liquidity", label: "Ease of trading", weight: W.liquidity, score: null, status: "no data", detail: "Trading volume not available (live quote needed)." });

  // 4. Diversification (top-10 concentration)
  if (fin(i.top10Weight) && i.top10Weight > 0 && i.top10Weight <= 1.0001) {
    const s = interp(TOP10_BANDS, i.top10Weight);
    pillars.push({ key: "diversification", label: "Diversification", weight: W.diversification, score: s, status: "scored", detail: `The 10 biggest holdings make up ${pc(i.top10Weight, 0)} of the fund, ${word(s, ["very spread out", "well spread out", "fairly concentrated", "highly concentrated"])}.` });
  } else pillars.push({ key: "diversification", label: "Diversification", weight: W.diversification, score: null, status: "no data", detail: "Holdings breakdown not available for this fund." });

  // 5. Income integrity: only for income-oriented, non-bond funds (bond price moves are driven by interest rates)
  const incomeApplies = fin(i.yieldTtm) && i.yieldTtm >= INCOME_YIELD_THRESHOLD && i.assetClass !== "Fixed income" && i.assetClass !== "Cash-like";
  if (!incomeApplies) {
    const why = i.assetClass === "Fixed income" || i.assetClass === "Cash-like" ? "bond and cash-like funds are judged on interest-rate risk elsewhere" : "not a high-yield fund";
    pillars.push({ key: "income", label: "Income sustainability", weight: W.income, score: null, status: "not applicable", detail: `Not applicable: ${why}.` });
  } else if (i.erosionLevel in EROSION_SCORE) {
    const s = EROSION_SCORE[i.erosionLevel];
    pillars.push({ key: "income", label: "Income sustainability", weight: W.income, score: s, status: "scored", detail: `Pays a ${pc(i.yieldTtm as number, 1)} yield. Its share price trend over 3 years shows "${i.erosionLevel.toLowerCase()}" erosion${s <= 35 ? ", meaning part of the payout may be coming out of your own capital" : ""}.` });
  } else pillars.push({ key: "income", label: "Income sustainability", weight: W.income, score: null, status: "no data", detail: "High-yield fund, but not enough price history to judge erosion." });

  // Score over available pillars
  const have = pillars.filter((p) => p.score != null);
  const coverage = have.reduce((s, p) => s + p.weight, 0);
  const ok = coverage >= MIN_COVERAGE - 1e-9;
  const score = ok ? have.reduce((s, p) => s + p.weight * (p.score as number), 0) / coverage : null;
  const rawGrade = score != null ? gradeFor(score) : null;

  // Hard caps
  const caps: { grade: QualityGrade; why: string }[] = [];
  if (i.leveraged) caps.push({ grade: "C", why: "Leveraged or inverse fund: built for short holding periods and can lose value quickly, so it is not suited to buy-and-hold." });
  if (fin(i.aum) && i.aum < SMALL_AUM) caps.push({ grade: "C", why: `Under ${usd(SMALL_AUM)} in assets: small funds are more likely to be closed.` });
  if (age != null && age < YOUNG_YEARS) caps.push({ grade: "C", why: `Less than ${YOUNG_YEARS} years old: too short a track record to judge.` });
  let grade = rawGrade;
  if (grade) for (const c of caps) grade = worseGrade(grade, c.grade);

  // Notes (informational, never change the grade)
  const notes: string[] = [];
  if (isOptionIncome(i.category, i.name)) notes.push("Uses options (such as covered calls) to generate income. That usually caps gains in strong rallies, and part of the payout can be a return of your own capital. Tax treatment varies.");
  if (i.assetClass === "Commodities & crypto") notes.push("Commodity and crypto funds can be structured in ways that change how they are taxed (some issue K-1 forms or tax gains at different rates). Check the fund's tax page before buying in a taxable account.");
  if (fin(i.top10Weight) && i.top10Weight >= 0.6) notes.push("Concentrated: a few holdings drive most of the result. That can be intentional for sector or theme funds, but it means less diversification.");
  if (!ok) notes.push(`Not enough data to grade (${Math.round(coverage * 100)}% of the criteria available, 70% needed).`);

  const strengths = have.filter((p) => (p.score as number) >= 85).map((p) => p.label.toLowerCase());
  const weaknesses = have.filter((p) => (p.score as number) < 55).map((p) => p.label.toLowerCase());
  const summary = !grade
    ? "Not enough data to grade this fund."
    : `${GRADE_WORD[grade]} fund quality${strengths.length ? `. Strong on ${strengths.join(", ")}` : ""}${weaknesses.length ? `${strengths.length ? "; weak" : ". Weak"} on ${weaknesses.join(", ")}` : ""}.`;

  return {
    grade,
    score,
    rawGrade,
    coverage,
    pillars,
    caps: caps.map((c) => c.why),
    notes,
    strengths,
    weaknesses,
    summary,
  };
}

/** Builds the scorer input from a stored ETF row plus optional live quote and spread history. */
export function qualityInputFromRow(r: EtfRow, q?: YahooQuote | null, spread?: SpreadStat | null, now?: Date): QualityInput {
  const w = (r.profile?.holdings ?? []).slice(0, 10).map((h) => h.weight).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const price = q?.price ?? r.lastClose;
  const vol = q?.avgVolume3m;
  return {
    assetClass: assetClassOf(r.category, r.profile?.allocation),
    category: r.category,
    name: r.name,
    leveraged: isLeveragedOrInverse(r.category, r.name),
    expense: r.expenseRatio,
    aum: r.totalAssets ?? q?.netAssets ?? null,
    inceptionDate: r.inceptionDate,
    firstBar: r.metrics?.firstBar ?? null,
    avgDollarVolume: typeof vol === "number" && vol > 0 && typeof price === "number" && price > 0 ? vol * price : null,
    spreadMedianRel: usableSpread(spread),
    top10Weight: w.length >= 5 ? w.reduce((s, x) => s + x, 0) : null,
    yieldTtm: r.metrics?.dividends.ttmYield ?? null,
    erosionLevel: r.metrics?.erosion.level ?? "n/a",
    now,
  };
}

export function qualityForRow(r: EtfRow, q?: YahooQuote | null, spread?: SpreadStat | null, now?: Date): QualityResult {
  return computeQuality(qualityInputFromRow(r, q, spread, now));
}
