/**
 * Volatility helpers used by Wheel tools: expected move, VRP, DTE buckets, income sizing.
 * Pure arithmetic on provider IV / HV — nothing is predicted.
 */

export function expectedMovePct(iv: number | null | undefined, dte: number, dayCount = 365): number | null {
  if (iv == null || !(iv > 0) || !(dte > 0) || !(dayCount > 0)) return null;
  return iv * Math.sqrt(dte / dayCount);
}

export type ExpectedMove = {
  one: number;
  two: number;
  pct1: number;
  pct2: number;
  low1: number;
  high1: number;
  low2: number;
  high2: number;
};

/** 1σ / 2σ dollar range. `vol` is annualized (0.25 = 25%). Calendar days / 365 by default. */
export function expectedMove(price: number, vol: number | null | undefined, dte: number, dayCount = 365): ExpectedMove | null {
  const pct1 = expectedMovePct(vol, dte, dayCount);
  if (pct1 == null || !(price > 0)) return null;
  const one = price * pct1;
  const two = one * 2;
  return {
    one,
    two,
    pct1,
    pct2: pct1 * 2,
    low1: Math.max(0, price - one),
    high1: price + one,
    low2: Math.max(0, price - two),
    high2: price + two,
  };
}

/** Implied minus realized, in percentage points. Positive = options priced richer than recent movement. */
export function vrpPp(iv: number | null | undefined, hv: number | null | undefined): number | null {
  if (iv == null || hv == null || !Number.isFinite(iv) || !Number.isFinite(hv)) return null;
  return (iv - hv) * 100;
}

export function sigmaDistance(price: number, strike: number, emPct: number | null): number | null {
  if (!(price > 0) || emPct == null || !(emPct > 0)) return null;
  return Math.abs(price - strike) / price / emPct;
}

export const DTE_BUCKETS = [
  { key: "7", label: "7d", min: 1, max: 10 },
  { key: "14", label: "14d", min: 11, max: 20 },
  { key: "30", label: "30d", min: 21, max: 37 },
  { key: "45", label: "45d", min: 38, max: 55 },
  { key: "75", label: "75d", min: 56, max: 90 },
] as const;

export type DteBucketKey = (typeof DTE_BUCKETS)[number]["key"];

export function dteBucket(dte: number): DteBucketKey | null {
  const b = DTE_BUCKETS.find((x) => dte >= x.min && dte <= x.max);
  return b?.key ?? null;
}

export type BucketRow = {
  key: DteBucketKey;
  label: string;
  n: number;
  medianCredit: number | null;
  medianSpreadPct: number | null;
  medianOi: number | null;
  medianIv: number | null;
  creditPerDay: number | null;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarizeDteBuckets(
  rows: { dte: number; credit: number; spreadPct: number | null; oi: number | null; iv: number | null }[],
): BucketRow[] {
  return DTE_BUCKETS.map((b) => {
    const inB = rows.filter((r) => r.dte >= b.min && r.dte <= b.max);
    const credits = inB.map((r) => r.credit);
    const spreads = inB.map((r) => r.spreadPct).filter((x): x is number => x != null);
    const ois = inB.map((r) => r.oi).filter((x): x is number => x != null);
    const ivs = inB.map((r) => r.iv).filter((x): x is number => x != null);
    const dtes = inB.map((r) => r.dte);
    const medC = median(credits);
    const medD = median(dtes);
    return {
      key: b.key,
      label: b.label,
      n: inB.length,
      medianCredit: medC,
      medianSpreadPct: median(spreads),
      medianOi: median(ois),
      medianIv: median(ivs),
      creditPerDay: medC != null && medD != null && medD > 0 ? medC / medD : null,
    };
  });
}

/** Cash needed to target a monthly premium, repeating a cycle of given ROC and DTE. */
export function capitalForMonthlyIncome(monthlyUsd: number, rocPerCycle: number, dte: number): {
  capital: number;
  cyclesPerYear: number;
  annualRoc: number;
} | null {
  if (!(monthlyUsd > 0) || !(rocPerCycle > 0) || !(dte > 0)) return null;
  const cyclesPerYear = 365 / dte;
  const annualRoc = rocPerCycle * cyclesPerYear;
  if (!(annualRoc > 0)) return null;
  return { capital: (monthlyUsd * 12) / annualRoc, cyclesPerYear, annualRoc };
}
