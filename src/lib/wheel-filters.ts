/** Query-string <-> filter mapping for the Wheel pages (a plain GET form, so every view is a shareable URL). */
import { DEFAULT_PARAMS, type WheelParams } from "./wheel";
import type { AccountFilter, WheelFilters } from "./wheel-service";
import { isPresetKey, STOCK_PRESETS, type MissingPolicy, type PresetKey } from "./stock-presets";
import type { StockThresholds } from "./stock-presets";

export type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const numIn = (v: string | string[] | undefined, def: number, lo: number, hi: number) => {
  const s = one(v);
  const n = s == null || s === "" ? NaN : Number(s);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const numOrNull = (v: string | string[] | undefined, lo: number, hi: number): number | null => {
  const s = one(v);
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

export function parseFilters(sp: SP): WheelFilters {
  const d = DEFAULT_PARAMS;
  let dteMin = Math.round(numIn(sp.dteMin, d.dteMin, 1, 120));
  let dteMax = Math.round(numIn(sp.dteMax, d.dteMax, 1, 120));
  if (dteMin > dteMax) [dteMin, dteMax] = [dteMax, dteMin];
  let deltaMin = numIn(sp.dMin, d.deltaMin, 0.01, 0.9);
  let deltaMax = numIn(sp.dMax, d.deltaMax, 0.01, 0.9);
  if (deltaMin > deltaMax) [deltaMin, deltaMax] = [deltaMax, deltaMin];
  const params: WheelParams = {
    deltaMin,
    deltaMax,
    dteMin,
    dteMax,
    minOi: Math.round(numIn(sp.oi, d.minOi, 0, 100000)),
    maxSpreadPct: numIn(sp.spread, d.maxSpreadPct * 100, 1, 100) / 100,
    minAnnReturn: numIn(sp.ret, d.minAnnReturn * 100, 0, 500) / 100,
    allowEarnings: one(sp.earn) === "1",
  };
  const acct = one(sp.acct);
  const account: AccountFilter = acct === "R" || acct === "T" ? acct : "all";

  // Stock grade preset (inclusive: B means B and better)
  const rawPreset = one(sp.preset) ?? one(sp.grade);
  let preset: PresetKey = "A";
  if (isPresetKey(rawPreset)) preset = rawPreset as PresetKey;
  else if (rawPreset === "A+") preset = "A+";
  else if (rawPreset === "all") preset = "all";

  const isCustom = one(sp.mode) === "custom";
  let stockThresholds: StockThresholds = {};
  let stockPreset: PresetKey = preset;
  let stockMode: "preset" | "custom" = isCustom ? "custom" : "preset";

  if (stockMode === "custom") {
    // Parse explicit thresholds when custom — percentages 0-100 → fraction, mktMin $B → $
    const pctOrFrac = (v: string | string[] | undefined) => {
      const n = numOrNull(v, 0, 100);
      if (n == null) return null;
      return n > 1 ? n / 100 : n;
    };
    const mktCapFromB = () => {
      const s = one(sp.mktMin);
      if (s == null || s === "") return null;
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      // User enters $B (e.g. 10) → dollars
      return n * 1e9;
    };
    stockThresholds = {
      opMarginMin: pctOrFrac(sp.opMin),
      roeMin: pctOrFrac(sp.roeMin),
      fcfMarginMin: pctOrFrac(sp.fcfmMin),
      debtEquityMax: numOrNull(sp.debtMax, 0, 10),
      netDebtEbitdaMax: numOrNull(sp.ndMax, 0, 10),
      currentRatioMin: numOrNull(sp.crMin, 0, 5),
      forwardPEMax: numOrNull(sp.peMax, 1, 100),
      pegMax: numOrNull(sp.pegMax, 0.1, 10),
      fcfYieldMin: pctOrFrac(sp.fcyMin),
      recMeanMax: numOrNull(sp.recMax, 1, 5),
      marketCapMin: mktCapFromB(),
      betaMax: numOrNull(sp.betaMax, 0, 3),
      ddMax: pctOrFrac(sp.ddMax),
    };
    // Clean nulls
    stockThresholds = Object.fromEntries(Object.entries(stockThresholds).filter(([, v]) => v != null)) as StockThresholds;
    stockPreset = isPresetKey(rawPreset) ? (rawPreset as PresetKey) : "A";
  } else {
    // Preset mode: thresholds are explanatory from STOCK_PRESETS, not enforced directly — grade engine is used
    stockPreset = preset;
    stockThresholds = STOCK_PRESETS[preset] ?? {};
  }

  const optionableOnly = one(sp.opt) !== "0"; // default ON
  const missingPolicy: MissingPolicy = one(sp.miss) === "keep" ? "keep" : "exclude";

  // Backward compat: minGrade used by old callers
  const minGrade = (preset === "all" ? "C" : preset) as WheelFilters["minGrade"];

  return {
    params,
    minGrade,
    stockMode,
    stockPreset,
    stockThresholds,
    optionableOnly,
    missingPolicy,
    account,
    trendOnly: one(sp.trend) === "1",
    minScore: numIn(sp.minScore, 15, 0, 100),
    divOnly: one(sp.divOnly) === "1",
  };
}

/** Params for the detail page links so the user's filters carry over. */
export function filtersQuery(f: WheelFilters): string {
  const p = f.params;
  const q = new URLSearchParams({
    dteMin: String(p.dteMin),
    dteMax: String(p.dteMax),
    dMin: String(p.deltaMin),
    dMax: String(p.deltaMax),
    oi: String(p.minOi),
    spread: String(Math.round(p.maxSpreadPct * 100)),
    ret: String(Math.round(p.minAnnReturn * 100)),
    minScore: String(f.minScore ?? 15),
  });
  // Stock filter (new)
  if (f.stockMode === "custom") {
    q.set("mode", "custom");
    if (f.stockPreset) q.set("preset", f.stockPreset);
    const t = f.stockThresholds as Record<string, number | null | undefined>;
    const map: Record<string, string> = {
      opMarginMin: "opMin",
      roeMin: "roeMin",
      fcfMarginMin: "fcfmMin",
      debtEquityMax: "debtMax",
      netDebtEbitdaMax: "ndMax",
      currentRatioMin: "crMin",
      forwardPEMax: "peMax",
      pegMax: "pegMax",
      fcfYieldMin: "fcyMin",
      recMeanMax: "recMax",
      marketCapMin: "mktMin",
      betaMax: "betaMax",
      ddMax: "ddMax",
    };
    for (const [k, param] of Object.entries(map)) {
      const v = t[k];
      if (v != null && Number.isFinite(v)) q.set(param, String(v));
    }
  } else {
    if (f.stockPreset !== "A") q.set("preset", f.stockPreset);
    // compat grade alias
    if (f.minGrade === "A+" || f.stockPreset === "A+") q.set("grade", "A+");
    else if (f.stockPreset === "B") q.set("preset", "B");
    else if (f.stockPreset === "C") q.set("preset", "C");
    else if (f.stockPreset === "all") q.set("preset", "all");
  }
  if (!f.optionableOnly) q.set("opt", "0");
  if (f.missingPolicy === "keep") q.set("miss", "keep");
  if (p.allowEarnings) q.set("earn", "1");
  if (f.trendOnly) q.set("trend", "1");
  if (f.divOnly) q.set("divOnly", "1");
  if (f.account !== "all") q.set("acct", f.account);
  return q.toString();
}
