/**
 * Stock quality grade (A+ ... F) for choosing underlyings you would be comfortable OWNING if a put is assigned.
 * Five pillars scored 0-100 on FIXED bands (never relative to other stocks), weighted, then hard caps applied.
 * Missing inputs are left out and the remaining weights are re-scaled; under 70% weight coverage = no grade.
 * This rates the business and the share price's behaviour. It is not a forecast and not advice.
 */
import { interp } from "./quality";

type Pt = [number, number];

export type StockGrade = "A+" | "A" | "B" | "C" | "D" | "F";
export const STOCK_GRADE_ORDER: StockGrade[] = ["A+", "A", "B", "C", "D", "F"];
export const stockGradeRank = (g: StockGrade) => STOCK_GRADE_ORDER.indexOf(g);
export const STOCK_GRADE_WORD: Record<StockGrade, string> = { "A+": "Outstanding", A: "Excellent", B: "Good", C: "Fair", D: "Weak", F: "Poor" };
export const stockGradeStyle: Record<StockGrade | "none", string> = {
  "A+": "bg-emerald-100 text-emerald-800 ring-emerald-300",
  A: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  B: "bg-lime-50 text-lime-700 ring-lime-200",
  C: "bg-amber-50 text-amber-800 ring-amber-200",
  D: "bg-orange-50 text-orange-700 ring-orange-200",
  F: "bg-rose-50 text-rose-700 ring-rose-200",
  none: "bg-slate-100 text-slate-500 ring-slate-200",
};
/** A+ >= 90, A >= 80, B >= 65, C >= 50, D >= 35, else F. */
export function stockGradeFor(score: number): StockGrade {
  return score >= 90 ? "A+" : score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : score >= 35 ? "D" : "F";
}
export const worseStockGrade = (a: StockGrade, b: StockGrade): StockGrade => (stockGradeRank(a) >= stockGradeRank(b) ? a : b);

export const STOCK_WEIGHTS = { quality: 0.3, strength: 0.2, valuation: 0.2, analysts: 0.15, size: 0.15 } as const;
export type StockPillarKey = keyof typeof STOCK_WEIGHTS;
export const STOCK_MIN_COVERAGE = 0.7;
export const MIN_ANALYSTS = 8;

/** Everything is a plain fraction (0.15 = 15%) unless noted. Any field may be null when the provider has no value. */
export type StockInputs = {
  price: number | null;
  marketCap: number | null;
  beta: number | null;
  forwardPE: number | null;
  trailingPE: number | null;
  pegRatio: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  roe: number | null;
  freeCashflow: number | null; // dollars
  totalRevenue: number | null; // dollars
  /** Debt / equity as a ratio (1.5 = debt is 1.5x equity). */
  debtToEquity: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  ebitda: number | null;
  currentRatio: number | null;
  /** 1 = strong buy ... 5 = strong sell. */
  recMean: number | null;
  analystCount: number | null;
  targetMean: number | null;
  /** Largest peak-to-trough fall over the last year, as a positive fraction. */
  dd1y: number | null;
};

export type StockPillar = { key: StockPillarKey; label: string; weight: number; score: number | null; letter: StockGrade | null; detail: string };
export type StockQuality = {
  grade: StockGrade | null;
  rawGrade: StockGrade | null;
  score: number | null;
  coverage: number;
  pillars: StockPillar[];
  caps: string[];
  summary: string;
};

const BANDS = {
  opMargin: [[0, 0], [0.08, 40], [0.15, 70], [0.25, 90], [0.35, 100]] as Pt[],
  roe: [[0, 0], [0.08, 40], [0.15, 70], [0.25, 90], [0.35, 100]] as Pt[],
  fcfMargin: [[0, 0], [0.05, 50], [0.12, 80], [0.2, 100]] as Pt[],
  debtEquity: [[0, 100], [0.5, 90], [1, 70], [2, 40], [4, 0]] as Pt[],
  netDebtEbitda: [[0, 100], [1, 90], [2, 70], [3, 45], [5, 0]] as Pt[],
  currentRatio: [[0.5, 0], [1, 50], [1.5, 80], [2, 100]] as Pt[],
  forwardPE: [[8, 100], [15, 90], [20, 75], [25, 55], [35, 25], [50, 0]] as Pt[],
  peg: [[0.8, 100], [1.5, 75], [2.5, 40], [4, 0]] as Pt[],
  fcfYield: [[0, 0], [0.02, 40], [0.04, 70], [0.06, 90], [0.08, 100]] as Pt[],
  recMean: [[1, 100], [1.8, 90], [2.3, 70], [3, 35], [4, 0]] as Pt[],
  upside: [[-0.1, 0], [0, 35], [0.1, 65], [0.2, 90], [0.3, 100]] as Pt[],
  marketCap: [[1e9, 0], [1e10, 35], [5e10, 70], [2e11, 90], [1e12, 100]] as Pt[],
  beta: [[0.6, 100], [1, 80], [1.3, 55], [1.8, 15], [2.5, 0]] as Pt[],
  drawdown: [[0.05, 100], [0.15, 80], [0.25, 55], [0.4, 20], [0.55, 0]] as Pt[],
};
export const STOCK_BANDS = BANDS;

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x: number, dp = 0) => `${(x * 100).toFixed(dp)}%`;
const money = (x: number) => (x >= 1e12 ? `$${(x / 1e12).toFixed(2)}T` : x >= 1e9 ? `$${(x / 1e9).toFixed(0)}B` : `$${(x / 1e6).toFixed(0)}M`);

type Part = { score: number; text: string };

export function computeStockQuality(i: StockInputs): StockQuality {
  const caps: string[] = [];

  // --- Business quality
  const q: Part[] = [];
  if (fin(i.operatingMargin)) q.push({ score: interp(BANDS.opMargin, i.operatingMargin), text: `operating margin ${pct(i.operatingMargin)}` });
  if (fin(i.roe)) q.push({ score: interp(BANDS.roe, i.roe), text: `return on equity ${pct(i.roe)}` });
  if (fin(i.freeCashflow) && fin(i.totalRevenue) && i.totalRevenue > 0) {
    const m = i.freeCashflow / i.totalRevenue;
    q.push({ score: interp(BANDS.fcfMargin, m), text: `free cash flow ${pct(m)} of sales` });
  }
  // --- Financial strength
  const s: Part[] = [];
  if (fin(i.debtToEquity)) s.push({ score: interp(BANDS.debtEquity, Math.max(0, i.debtToEquity)), text: `debt ${i.debtToEquity.toFixed(2)}x equity` });
  if (fin(i.totalDebt) && fin(i.totalCash) && fin(i.ebitda) && i.ebitda > 0) {
    const nd = (i.totalDebt - i.totalCash) / i.ebitda;
    s.push({ score: interp(BANDS.netDebtEbitda, Math.max(0, nd)), text: nd <= 0 ? "more cash than debt" : `net debt ${nd.toFixed(1)}x earnings` });
  }
  if (fin(i.currentRatio)) s.push({ score: interp(BANDS.currentRatio, i.currentRatio), text: `current ratio ${i.currentRatio.toFixed(1)}` });
  // --- Valuation (cheaper is better)
  const v: Part[] = [];
  const pe = fin(i.forwardPE) && i.forwardPE > 0 ? i.forwardPE : null;
  if (pe != null) v.push({ score: interp(BANDS.forwardPE, pe), text: `forward P/E ${pe.toFixed(1)}` });
  if (fin(i.pegRatio) && i.pegRatio > 0) v.push({ score: interp(BANDS.peg, i.pegRatio), text: `PEG ${i.pegRatio.toFixed(1)}` });
  if (fin(i.freeCashflow) && fin(i.marketCap) && i.marketCap > 0) {
    const y = i.freeCashflow / i.marketCap;
    v.push({ score: interp(BANDS.fcfYield, y), text: `free cash flow yield ${pct(y, 1)}` });
  }
  // --- Analysts (only with enough of them)
  const a: Part[] = [];
  const enough = fin(i.analystCount) && i.analystCount >= MIN_ANALYSTS;
  if (enough && fin(i.recMean)) a.push({ score: interp(BANDS.recMean, i.recMean), text: `consensus ${i.recMean.toFixed(1)} (1 = strong buy, 5 = sell) from ${i.analystCount} analysts` });
  if (enough && fin(i.targetMean) && fin(i.price) && i.price > 0) {
    const up = i.targetMean / i.price - 1;
    a.push({ score: interp(BANDS.upside, up), text: `average target ${up >= 0 ? "+" : ""}${pct(up)} vs price` });
  }
  // --- Size & stability
  const z: Part[] = [];
  if (fin(i.marketCap)) z.push({ score: interp(BANDS.marketCap.map(([x, y]) => [Math.log10(x), y] as Pt), Math.log10(Math.max(i.marketCap, 1))), text: `market cap ${money(i.marketCap)}` });
  if (fin(i.beta)) z.push({ score: interp(BANDS.beta, i.beta), text: `beta ${i.beta.toFixed(2)}` });
  if (fin(i.dd1y)) z.push({ score: interp(BANDS.drawdown, i.dd1y), text: `worst 1-year fall ${pct(i.dd1y)}` });

  const mk = (key: StockPillarKey, label: string, parts: Part[], noData: string): StockPillar => {
    const score = avg(parts.map((p) => p.score));
    return { key, label, weight: STOCK_WEIGHTS[key], score, letter: score != null ? stockGradeFor(score) : null, detail: parts.length ? parts.map((p) => p.text).join("; ") : noData };
  };
  const pillars: StockPillar[] = [
    mk("quality", "Business quality", q, "No profitability data."),
    mk("strength", "Financial strength", s, "No balance-sheet data (common for banks and insurers)."),
    mk("valuation", "Valuation", v, "No usable earnings or cash-flow multiples (loss-making or missing)."),
    mk("analysts", "Analyst view", a, `Fewer than ${MIN_ANALYSTS} analysts cover this stock, so the view is not used.`),
    mk("size", "Size & stability", z, "No size or volatility data."),
  ];

  const have = pillars.filter((p) => p.score != null);
  const wHave = have.reduce((n, p) => n + p.weight, 0);
  const coverage = wHave;
  const ok = coverage >= STOCK_MIN_COVERAGE;
  const score = ok ? have.reduce((n, p) => n + (p.score as number) * p.weight, 0) / wHave : null;
  const raw = score != null ? stockGradeFor(score) : null;

  let grade = raw;
  const cap = (g: StockGrade, why: string) => {
    caps.push(why);
    if (grade) grade = worseStockGrade(grade, g);
  };
  if (fin(i.operatingMargin) && i.operatingMargin < 0) cap("C", "Loses money from operations: the business is not self-funding.");
  else if (fin(i.profitMargin) && i.profitMargin < 0) cap("C", "Reports a net loss.");
  if (fin(i.freeCashflow) && i.freeCashflow < 0) cap("B", "Negative free cash flow: spends more cash than it earns.");
  if (fin(i.marketCap) && i.marketCap < 1e10) cap("B", "Market cap under $10 billion: smaller companies gap more.");
  if (enough && fin(i.recMean) && i.recMean >= 3.5) cap("C", "Analyst consensus leans to sell.");
  if (fin(i.dd1y) && i.dd1y >= 0.4) cap("B", "Fell 40% or more peak-to-trough in the past year.");

  const best = have.filter((p) => (p.score as number) >= 85).map((p) => p.label.toLowerCase());
  const worst = have.filter((p) => (p.score as number) < 55).map((p) => p.label.toLowerCase());
  const summary = !grade
    ? "Not enough data to grade this stock."
    : `${STOCK_GRADE_WORD[grade]} stock quality${best.length ? `. Strong on ${best.join(", ")}` : ""}${worst.length ? `${best.length ? "; weak" : ". Weak"} on ${worst.join(", ")}` : ""}.`;

  return { grade, rawGrade: raw, score, coverage, pillars, caps, summary };
}
