import type { MacroPoint } from "./macro";
import type { PolicyRates, YieldCurve } from "./macro";

/**
 * Sprint A — Macro → Action
 * Derives a plain-English regime label + implications from live macro data.
 * No new data source — purely synthesis of existing FRED + NY Fed + curve.
 */

export type RegimeLabel = "stress" | "tightening" | "easing" | "neutral";

export type Regime = {
  label: RegimeLabel;
  title: string;
  summary: string;
  implication: string;
  detail: string;
  signals: {
    effrTarget: number | null; // %
    effrDate: string | null;
    spread10y2y: number | null; // pp
    spread10y3m?: number | null;
    realYield10y: number | null; // %
    cpiYoY: number | null;
    corePceYoY: number | null;
    unrate: number | null;
    vix: number | null;
    hySpread: number | null;
  };
  warnings: string[];
  asOf: string | null; // latest observation date used
  missing: string[]; // ids we couldn't read
  palette: { border: string; bg: string; text: string; dot: string };
};

const paletteFor = (label: RegimeLabel) => {
  switch (label) {
    case "stress":
      return { border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-200", dot: "bg-rose-400" };
    case "tightening":
      return { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-200", dot: "bg-amber-400" };
    case "easing":
      return { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-200", dot: "bg-emerald-400" };
    default:
      return { border: "border-slate-700", bg: "bg-slate-800/40", text: "text-slate-200", dot: "bg-slate-400" };
  }
};

function find(snap: MacroPoint[] | null | undefined, id: string): MacroPoint | undefined {
  return snap?.find((p) => p.def.id === id);
}

function val(snap: MacroPoint[] | null | undefined, id: string): number | null {
  const p = find(snap, id);
  return p?.latest ?? null;
}

function isStress(vix: number | null, hy: number | null): boolean {
  if (vix != null && vix >= 30) return true;
  if (hy != null && hy >= 6) return true; // 600bp OAS
  if (vix != null && vix >= 25 && hy != null && hy >= 5) return true;
  return false;
}

export function deriveRegime(input: {
  snap: MacroPoint[] | null;
  curve: YieldCurve | null;
  policy: PolicyRates | null;
}): Regime | null {
  const { snap, curve, policy } = input;
  if (!snap) return null;

  const vix = val(snap, "VIXCLS");
  const hy = val(snap, "BAMLH0A0HYM2");
  const t10y2y = val(snap, "T10Y2Y");
  const dgs10 = val(snap, "DGS10");
  const breakeven = val(snap, "T10YIE");
  const cpi = val(snap, "CPIAUCSL");
  const corePce = val(snap, "PCEPILFE");
  const unrate = val(snap, "UNRATE");
  const dgs3mo = val(snap, "DGS3MO");

  // Fallback spread from curve points if T10Y2Y missing
  let spread10y2y: number | null = t10y2y;
  if (spread10y2y == null && curve) {
    const p10 = curve.points.find((p) => p.label === "10Y")?.now ?? null;
    const p2 = curve.points.find((p) => p.label === "2Y")?.now ?? null;
    if (p10 != null && p2 != null) spread10y2y = p10 - p2;
  }
  let spread10y3m: number | null = null;
  if (curve) {
    const p10 = curve.points.find((p) => p.label === "10Y")?.now ?? null;
    const p3m = curve.points.find((p) => p.label === "3M")?.now ?? null;
    if (p10 != null && p3m != null) spread10y3m = p10 - p3m;
  }

  const realYield = dgs10 != null && breakeven != null ? dgs10 - breakeven : null;
  const effrTarget = policy?.effr?.targetTo ?? policy?.effr?.targetFrom ?? val(snap, "DFF");

  const missing: string[] = [];
  if (vix == null) missing.push("VIXCLS");
  if (hy == null) missing.push("BAMLH0A0HYM2");
  if (spread10y2y == null) missing.push("T10Y2Y/10Y-2Y");
  if (realYield == null) missing.push("real 10Y");
  if (cpi == null) missing.push("CPIAUCSL");
  if (unrate == null) missing.push("UNRATE");

  // Determine label
  let label: RegimeLabel = "neutral";
  if (isStress(vix, hy)) label = "stress";
  else if (spread10y2y != null && spread10y2y < -0.1 && effrTarget != null && effrTarget >= 4) label = "tightening";
  else if (spread10y2y != null && spread10y2y > 0.8 && effrTarget != null && effrTarget < 3.5) label = "easing";
  else if (realYield != null && realYield > 2.2 && spread10y2y != null && spread10y2y < 0.2) label = "tightening";
  else if (realYield != null && realYield < 0.8 && spread10y2y != null && spread10y2y > 0.5) label = "easing";

  // Warnings
  const warnings: string[] = [];
  if (vix != null && vix >= 30) warnings.push(`VIX ${vix.toFixed(1)} — elevated volatility`);
  if (hy != null && hy >= 6) warnings.push(`HY OAS ${hy.toFixed(2)} pp — credit stress`);
  if (spread10y2y != null && spread10y2y < 0) warnings.push(`Curve inverted ${spread10y2y.toFixed(2)} pp — late-cycle signal`);
  if (realYield != null && realYield > 2.5) warnings.push(`Real 10Y ${realYield.toFixed(2)}% — high real yields pressure duration & growth multiples`);
  if (cpi != null && cpi > 4) warnings.push(`CPI ${cpi.toFixed(1)}% — well above Fed target`);
  if (unrate != null) {
    // Sahm proxy: simple check if unemployment jumped 0.5pp from 12m low — approximate via history
    const uHist = find(snap, "UNRATE")?.history;
    if (uHist && uHist.length >= 12) {
      const last12 = uHist.slice(-12);
      const low = Math.min(...last12.slice(0, -1).map((o) => o.value));
      const cur = last12[last12.length - 1].value;
      if (cur - low >= 0.5) warnings.push(`Sahm trigger: unemployment +${(cur - low).toFixed(2)}pp from 12M low — recession risk elevated`);
    }
  }

  const effrDate = policy?.effr?.date ?? find(snap, "DFF")?.date ?? null;
  const asOfDates = [find(snap, "VIXCLS")?.date, find(snap, "BAMLH0A0HYM2")?.date, find(snap, "T10Y2Y")?.date, curve?.asOf].filter(Boolean) as string[];
  const asOf = asOfDates.sort().slice(-1)[0] ?? null;

  let title: string;
  let summary: string;
  let implication: string;
  let detail: string;

  if (label === "stress") {
    title = "Market Stress";
    summary = `VIX and credit spreads signal stress. Risk-off regime — capital preservation first.`;
    implication = "Favor cash-like (BIL, SGOV), short duration, defensive equity (SCHD, USMV, VYM); tighten Wheel to delta ≤0.20 & OI ≥500; keep cash reserve high.";
    detail = `Stress overrides the cycle signal. Even if policy is easing, stretched credit and vol mean put-selling should be smaller and higher-quality.`;
  } else if (label === "tightening") {
    title = "Tightening / Late-cycle";
    summary = `Policy tight, curve flat/inverted, real yields elevated. Duration is punished.`;
    implication = "Favor short duration and quality: SGOV/BIL, SCHD/VYM/USMV; avoid long-duration growth (QQQ, TLT) and high-beta put underlyings.";
    detail = `When real 10Y is high and the curve is inverted, discount rates rise and earnings multiples compress — defensive positioning outperforms.`;
  } else if (label === "easing") {
    title = "Easing / Recovery";
    summary = `Curve steepening, real yields contained, policy moving lower. Risk appetite returning.`;
    implication = "Extend duration gently: IEF/VCIT, growth equity (QQQ, VOT), slightly wider put DTE/delta OK — keep quality gate A/A+.";
    detail = `Easing steepens the curve and lowers real yields — long duration and growth multiples expand first.`;
  } else {
    title = "Neutral / Mid-cycle";
    summary = `No strong cycle or stress signal — balanced positioning.`;
    implication = "Balanced 60/40 style mix works: VTI/VOO + BND/AGG; Wheel at defaults (0.15–0.30 delta, 21–50 DTE) is reasonable.";
    detail = `When neither stress nor a clear tightening/easing impulse dominates, diversification and quality beat timing.`;
  }

  return {
    label,
    title,
    summary,
    implication,
    detail,
    signals: {
      effrTarget: effrTarget ?? null,
      effrDate,
      spread10y2y: spread10y2y ?? null,
      spread10y3m: spread10y3m,
      realYield10y: realYield,
      cpiYoY: cpi,
      corePceYoY: corePce,
      unrate,
      vix,
      hySpread: hy,
    },
    warnings,
    asOf,
    missing,
    palette: paletteFor(label),
  };
}

export function regimeGuardrails(regime: Regime | null) {
  if (!regime) return null;
  if (regime.label === "stress") {
    return {
      deltaMax: 0.2,
      minOi: 500,
      maxSpreadPct: 0.08,
      note: "Stress: tighten to 0.15–0.20 delta, OI ≥500, spread ≤8% — premiums are rich but gaps are real.",
    };
  }
  if (regime.label === "tightening") {
    return {
      deltaMax: 0.25,
      minOi: 200,
      maxSpreadPct: 0.1,
      note: "Late-cycle: prefer lower-beta puts, OI ≥200, keep 20–30% cash reserve.",
    };
  }
  if (regime.label === "easing") {
    return {
      deltaMax: 0.3,
      minOi: 100,
      maxSpreadPct: 0.1,
      note: "Easing: defaults OK; quality A/A+ gate matters more than tightening delta.",
    };
  }
  return { deltaMax: 0.3, minOi: 100, maxSpreadPct: 0.1, note: "Neutral: balanced Wheel defaults are reasonable." };
}
