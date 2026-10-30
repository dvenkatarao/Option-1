import type { EtfMetricsJson, HistoryJson, PeriodReturn } from "@/db/schema";

/**
 * Pure, deterministic analytics. Inputs are raw provider series only.
 * Every formula is documented in the spec so results can be independently reproduced.
 *
 *  - Price return  = close[end] / close[start] - 1               (close is split-adjusted only)
 *  - Total return  = adjclose[end] / adjclose[start] - 1         (adjclose reinvests distributions on ex-date)
 *  - Annualised    = (1 + r) ^ (365.25 / calendarDays) - 1       (only for windows > 1 year, only if history covers the window)
 *  - Volatility    = stdev(daily adjclose returns) * sqrt(252)
 *  - Max drawdown  = min over t of (adjclose[t] / running peak - 1)
 */

const DAY = 86400;

export function iso(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** index of last bar with t <= target, or -1 */
function idxAtOrBefore(t: number[], target: number): number {
  let lo = 0;
  let hi = t.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= target) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function dailyReturns(a: number[], from = 0): number[] {
  const r: number[] = [];
  for (let i = Math.max(1, from + 1); i < a.length; i++) {
    if (a[i - 1] > 0) r.push(a[i] / a[i - 1] - 1);
  }
  return r;
}

function stdev(x: number[]): number | null {
  if (x.length < 20) return null;
  const m = x.reduce((s, v) => s + v, 0) / x.length;
  const v = x.reduce((s, y) => s + (y - m) ** 2, 0) / (x.length - 1);
  return Math.sqrt(v);
}

function maxDrawdown(a: number[], from: number): number | null {
  if (a.length - from < 20) return null;
  let peak = a[from];
  let mdd = 0;
  for (let i = from; i < a.length; i++) {
    if (a[i] > peak) peak = a[i];
    const dd = a[i] / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
}

function annualise(r: number, days: number): number {
  return (1 + r) ** (365.25 / days) - 1;
}

const WINDOWS: { key: keyof EtfMetricsJson["returns"]; days: number; long: boolean }[] = [
  { key: "1M", days: 30, long: false },
  { key: "3M", days: 91, long: false },
  { key: "6M", days: 182, long: false },
  { key: "1Y", days: 365, long: false },
  { key: "3Y", days: 365 * 3, long: true },
  { key: "5Y", days: 365 * 5, long: true },
  { key: "10Y", days: 365 * 10, long: true },
];

export function periodReturn(h: HistoryJson, startIdx: number, calendarDays: number, annualised: boolean): PeriodReturn {
  const n = h.t.length - 1;
  if (startIdx < 0 || startIdx >= n || h.c[startIdx] <= 0 || h.a[startIdx] <= 0) {
    return { price: null, total: null, annualised };
  }
  let price = h.c[n] / h.c[startIdx] - 1;
  let total = h.a[n] / h.a[startIdx] - 1;
  if (annualised) {
    price = annualise(price, calendarDays);
    total = annualise(total, calendarDays);
  }
  return { price, total, annualised };
}

export function computeMetrics(h: HistoryJson, lastClose?: number | null): EtfMetricsJson | null {
  const n = h.t.length - 1;
  if (n < 5) return null;
  const lastT = h.t[n];
  const first = h.t[0];

  const empty: PeriodReturn = { price: null, total: null, annualised: false };
  const returns = {} as EtfMetricsJson["returns"];
  for (const w of WINDOWS) {
    const target = lastT - w.days * DAY;
    // Require the history to actually reach back to the window start (small tolerance for weekends)
    if (first > target + 5 * DAY) {
      returns[w.key] = { ...empty, annualised: w.long };
      continue;
    }
    // History reaches back to within the tolerance but its first bar may fall just after the target
    // (weekend / holiday): use the first bar rather than discarding a window the data effectively covers.
    const idx = Math.max(0, idxAtOrBefore(h.t, target));
    returns[w.key] = periodReturn(h, idx, w.days, w.long);
  }
  // YTD: from last bar of the prior calendar year
  const yearStart = Date.UTC(new Date(lastT * 1000).getUTCFullYear(), 0, 1) / 1000;
  const ytdIdx = idxAtOrBefore(h.t, yearStart - 1);
  returns.YTD = ytdIdx >= 0 ? periodReturn(h, ytdIdx, 365, false) : empty;

  // Risk
  const i1y = idxAtOrBefore(h.t, lastT - 365 * DAY);
  const i3y = first > lastT - 365 * 3 * DAY + 5 * DAY ? -1 : Math.max(0, idxAtOrBefore(h.t, lastT - 365 * 3 * DAY));
  const i5y = first > lastT - 365 * 5 * DAY + 5 * DAY ? -1 : Math.max(0, idxAtOrBefore(h.t, lastT - 365 * 5 * DAY));
  const vol = (from: number) => {
    if (from < 0) return null;
    const s = stdev(dailyReturns(h.a, from));
    return s == null ? null : s * Math.sqrt(252);
  };

  // 52 week range on split-adjusted close
  let high52: number | null = null;
  let low52: number | null = null;
  if (i1y >= 0) {
    for (let i = i1y; i <= n; i++) {
      if (high52 == null || h.c[i] > high52) high52 = h.c[i];
      if (low52 == null || h.c[i] < low52) low52 = h.c[i];
    }
  }
  const price = lastClose ?? h.c[n];

  // Dividends / distributions
  const ttmStart = lastT - 365 * DAY;
  const prevStart = lastT - 730 * DAY;
  const ttm = h.d.filter(([t]) => t > ttmStart);
  const prev = h.d.filter(([t]) => t > prevStart && t <= ttmStart);
  const ttmAmount = ttm.reduce((s, [, v]) => s + v, 0);
  const prevAmount = prev.reduce((s, [, v]) => s + v, 0);
  const y3Start = lastT - 365 * 3 * DAY;
  const ttm3Ago = h.d.filter(([t]) => t > y3Start - 365 * DAY && t <= y3Start).reduce((s, [, v]) => s + v, 0);
  const y5Start = lastT - 365 * 5 * DAY;
  const ttm5Ago = h.d.filter(([t]) => t > y5Start - 365 * DAY && t <= y5Start).reduce((s, [, v]) => s + v, 0);
  const histCovers2y = first <= prevStart + 5 * DAY;
  const histCovers4y = first <= y3Start - 365 * DAY + 5 * DAY;
  const histCovers6y = first <= y5Start - 365 * DAY + 5 * DAY;
  const lastDiv = h.d.length ? h.d[h.d.length - 1] : null;
  const freq = frequencyLabel(ttm.length);

  const startPrice3y = i3y >= 0 ? h.c[i3y] : null;
  const cum3y = i3y >= 0 ? h.d.filter(([t]) => t > y3Start).reduce((s, [, v]) => s + v, 0) : null;

  // NAV erosion proxy (market-price based)
  const priceAnn1y = returns["1Y"].price;
  const priceAnn3y = returns["3Y"].price;
  const priceAnn5y = returns["5Y"].price;
  const totalAnn3y = returns["3Y"].total;
  const distAnn3y = cum3y != null && startPrice3y ? cum3y / startPrice3y / 3 : null;
  let funded: number | null = null;
  if (priceAnn3y != null && distAnn3y != null) {
    funded = distAnn3y > 0 && priceAnn3y < 0 ? Math.min(1, -priceAnn3y / distAnn3y) : 0;
  }
  let level: EtfMetricsJson["erosion"]["level"] = "n/a";
  const basis = priceAnn3y ?? priceAnn1y;
  if (basis != null) {
    level = basis >= 0 ? "None" : basis > -0.02 ? "Mild" : basis > -0.06 ? "Moderate" : "Severe";
  }

  return {
    asOf: iso(lastT),
    firstBar: iso(first),
    bars: h.t.length,
    returns,
    vol1y: vol(i1y),
    vol3y: vol(i3y),
    maxDrawdown3y: i3y >= 0 ? maxDrawdown(h.a, i3y) : null,
    maxDrawdown5y: i5y >= 0 ? maxDrawdown(h.a, i5y) : null,
    high52w: high52,
    low52w: low52,
    fromHigh52w: high52 && price ? price / high52 - 1 : null,
    dividends: {
      ttmAmount: ttm.length ? ttmAmount : h.d.length ? 0 : null,
      ttmYield: price > 0 && h.d.length ? ttmAmount / price : null,
      ttmCount: ttm.length,
      frequency: h.d.length ? freq : "None",
      lastAmount: lastDiv ? lastDiv[1] : null,
      lastExDate: lastDiv ? iso(lastDiv[0]) : null,
      growth1y: histCovers2y && prevAmount > 0 ? ttmAmount / prevAmount - 1 : null,
      cagr3y: histCovers4y && ttm3Ago > 0 && ttmAmount > 0 ? (ttmAmount / ttm3Ago) ** (1 / 3) - 1 : null,
      cagr5y: histCovers6y && ttm5Ago > 0 && ttmAmount > 0 ? (ttmAmount / ttm5Ago) ** (1 / 5) - 1 : null,
      cum3yPctOfStartPrice: cum3y != null && startPrice3y ? cum3y / startPrice3y : null,
    },
    erosion: {
      priceReturnAnn1y: priceAnn1y,
      priceReturnAnn3y: priceAnn3y,
      priceReturnAnn5y: priceAnn5y,
      distYieldAnn3y: distAnn3y,
      totalReturnAnn3y: totalAnn3y,
      capitalFundedShare3y: funded,
      level,
    },
  };
}

function frequencyLabel(n: number): string {
  if (n === 0) return "None in 12m";
  if (n >= 48) return "Weekly";
  if (n >= 10) return "Monthly";
  if (n >= 3) return "Quarterly";
  if (n === 2) return "Semi-annual";
  return "Annual / irregular";
}

export function sharpe(m: EtfMetricsJson | null | undefined, rf: number | null): number | null {
  if (!m || rf == null) return null;
  const r = m.returns["3Y"].total;
  const v = m.vol3y;
  if (r == null || v == null || v === 0) return null;
  return (r - rf) / v;
}

/** Pearson correlation + beta from aligned daily returns (by timestamp). */
export function alignedStats(
  a: HistoryJson,
  b: HistoryJson,
  years = 3,
): { corr: number | null; beta: number | null; n: number } {
  const lastT = Math.min(a.t[a.t.length - 1], b.t[b.t.length - 1]);
  const start = lastT - years * 365 * DAY;
  const mapB = new Map<number, number>();
  for (let i = 0; i < b.t.length; i++) mapB.set(dayKey(b.t[i]), b.a[i]);
  const xs: number[] = [];
  const ys: number[] = [];
  let pa: number | null = null;
  let pb: number | null = null;
  for (let i = 0; i < a.t.length; i++) {
    if (a.t[i] < start || a.t[i] > lastT) continue;
    const bv = mapB.get(dayKey(a.t[i]));
    if (bv == null) continue;
    if (pa != null && pb != null && pa > 0 && pb > 0) {
      xs.push(a.a[i] / pa - 1);
      ys.push(bv / pb - 1);
    }
    pa = a.a[i];
    pb = bv;
  }
  const n = xs.length;
  if (n < 60) return { corr: null, beta: null, n };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  // beta of A relative to benchmark B = cov(A,B)/var(B)
  return { corr: sxy / Math.sqrt(sxx * syy), beta: sxy / syy, n };
}

function dayKey(ts: number) {
  return Math.floor(ts / DAY);
}
