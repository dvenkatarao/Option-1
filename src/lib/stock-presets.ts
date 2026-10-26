/**
 * Stock filter presets that map A+/A/B/C grades to explicit fundamental thresholds.
 * Inclusive: B means B and better (≥65), etc. Used for transparent stock filtering.
 * Custom mode allows user-supplied thresholds.
 */

import type { StockGrade } from "./stock-quality";
import type { StockInputs } from "./stock-quality";

export type PresetKey = "A+" | "A" | "B" | "C" | "all";
export const PRESET_ORDER: PresetKey[] = ["A+", "A", "B", "C", "all"];

export const PRESET_LABEL: Record<PresetKey, string> = {
  "A+": "A+ Outstanding",
  A: "A Excellent",
  B: "B Good",
  C: "C Fair",
  all: "All graded",
};

export const PRESET_DESC: Record<PresetKey, string> = {
  "A+": "Only Outstanding (≥90) — strongest quality, low debt, cheap, stable",
  A: "Excellent and better (≥80) — default",
  B: "Good and better (≥65) — includes A/A+",
  C: "Fair and better (≥50) — includes B/A/A+",
  all: "All graded stocks (F to A+)",
};

export const PRESET_GRADE_MIN: Record<PresetKey, StockGrade | null> = {
  "A+": "A+",
  A: "A",
  B: "B",
  C: "C",
  all: null,
};

/**
 * Explicit thresholds that populate the Stock Filter UI when a preset is chosen.
 * These are explanatory — preset mode still uses grade engine for eligibility.
 * Custom mode enforces these directly against fundamentals.
 * Values chosen from BAND midpoints for 90/80/65/50 scores.
 */
export type StockThresholds = {
  opMarginMin?: number | null;
  roeMin?: number | null;
  fcfMarginMin?: number | null;
  debtEquityMax?: number | null;
  netDebtEbitdaMax?: number | null;
  currentRatioMin?: number | null;
  forwardPEMax?: number | null;
  pegMax?: number | null;
  fcfYieldMin?: number | null;
  recMeanMax?: number | null;
  marketCapMin?: number | null;
  betaMax?: number | null;
  ddMax?: number | null;
};

export const STOCK_PRESETS: Record<PresetKey, StockThresholds> = {
  "A+": {
    opMarginMin: 0.25,
    roeMin: 0.25,
    fcfMarginMin: 0.12,
    debtEquityMax: 0.5,
    netDebtEbitdaMax: 1.0,
    currentRatioMin: 1.5,
    forwardPEMax: 15,
    pegMax: 1.5,
    fcfYieldMin: 0.06,
    recMeanMax: 1.8,
    marketCapMin: 5e10,
    betaMax: 1.0,
    ddMax: 0.15,
  },
  A: {
    opMarginMin: 0.15,
    roeMin: 0.15,
    fcfMarginMin: 0.05,
    debtEquityMax: 1.0,
    netDebtEbitdaMax: 2.0,
    currentRatioMin: 1.2,
    forwardPEMax: 20,
    pegMax: 2.0,
    fcfYieldMin: 0.04,
    recMeanMax: 2.3,
    marketCapMin: 1e10,
    betaMax: 1.3,
    ddMax: 0.25,
  },
  B: {
    opMarginMin: 0.08,
    roeMin: 0.08,
    fcfMarginMin: 0.02,
    debtEquityMax: 2.0,
    netDebtEbitdaMax: 3.0,
    currentRatioMin: 1.0,
    forwardPEMax: 25,
    pegMax: 2.5,
    fcfYieldMin: 0.02,
    recMeanMax: 3.0,
    marketCapMin: 2e9,
    betaMax: 1.8,
    ddMax: 0.40,
  },
  C: {
    opMarginMin: 0,
    roeMin: 0,
    debtEquityMax: 4.0,
    netDebtEbitdaMax: 5.0,
    currentRatioMin: 0.5,
    forwardPEMax: 35,
    pegMax: 4.0,
    fcfYieldMin: 0,
    recMeanMax: 4.0,
    marketCapMin: null,
    betaMax: 2.5,
    ddMax: 0.55,
  },
  all: {},
};

export function isPresetKey(k: string | undefined): k is PresetKey {
  return !!k && (PRESET_ORDER as string[]).includes(k);
}

export type MissingPolicy = "exclude" | "keep";

export type ThresholdEval = {
  pass: boolean;
  /** Filtered fields that had no usable value. */
  missing: string[];
};

const usable = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * Evaluate custom thresholds. Missing is never guessed.
 * `exclude` (default): a missing filtered field fails the name.
 * `keep`: a missing filtered field is ignored; other fields still apply.
 */
export function evaluateStockThresholds(
  inputs: StockInputs | null | undefined,
  t: StockThresholds,
  missingPolicy: MissingPolicy = "exclude",
): ThresholdEval {
  if (!inputs) return { pass: false, missing: ["fundamentals"] };
  const missing: string[] = [];
  let valueFail = false;

  const requireMin = (name: string, value: number | null | undefined, threshold: number | null | undefined) => {
    if (threshold == null) return;
    if (!usable(value)) {
      missing.push(name);
      return;
    }
    if (value < threshold) valueFail = true;
  };
  const requireMax = (name: string, value: number | null | undefined, threshold: number | null | undefined) => {
    if (threshold == null) return;
    if (!usable(value)) {
      missing.push(name);
      return;
    }
    if (value > threshold) valueFail = true;
  };

  requireMin("operating margin", inputs.operatingMargin, t.opMarginMin);
  requireMin("ROE", inputs.roe, t.roeMin);
  const fcfMargin =
    usable(inputs.freeCashflow) && usable(inputs.totalRevenue) && inputs.totalRevenue > 0 ? inputs.freeCashflow / inputs.totalRevenue : null;
  requireMin("FCF margin", fcfMargin, t.fcfMarginMin);
  requireMax("debt/equity", inputs.debtToEquity, t.debtEquityMax);
  const netDebtEbitda =
    usable(inputs.totalDebt) && usable(inputs.totalCash) && usable(inputs.ebitda) && inputs.ebitda > 0
      ? (inputs.totalDebt - inputs.totalCash) / inputs.ebitda
      : null;
  requireMax("net debt/EBITDA", netDebtEbitda, t.netDebtEbitdaMax);
  requireMin("current ratio", inputs.currentRatio, t.currentRatioMin);
  const forwardPE = usable(inputs.forwardPE) && inputs.forwardPE > 0 ? inputs.forwardPE : null;
  requireMax("forward P/E", forwardPE, t.forwardPEMax);
  const peg = usable(inputs.pegRatio) && inputs.pegRatio > 0 ? inputs.pegRatio : null;
  requireMax("PEG", peg, t.pegMax);
  const fcfYield =
    usable(inputs.freeCashflow) && usable(inputs.marketCap) && inputs.marketCap > 0 ? inputs.freeCashflow / inputs.marketCap : null;
  requireMin("FCF yield", fcfYield, t.fcfYieldMin);
  requireMax("analyst rating", inputs.recMean, t.recMeanMax);
  requireMin("market cap", inputs.marketCap, t.marketCapMin);
  requireMax("beta", inputs.beta, t.betaMax);
  requireMax("drawdown", inputs.dd1y, t.ddMax);

  const missingBlocks = missingPolicy === "exclude" && missing.length > 0;
  return { pass: !valueFail && !missingBlocks, missing };
}

export function passesStockThresholds(
  inputs: StockInputs | null | undefined,
  t: StockThresholds,
  missingPolicy: MissingPolicy = "exclude",
): boolean {
  return evaluateStockThresholds(inputs, t, missingPolicy).pass;
}
