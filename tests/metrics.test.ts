import { describe, expect, it } from "vitest";
import { alignedStats, computeMetrics, sharpe } from "@/lib/metrics";
import type { HistoryJson } from "@/db/schema";

const DAY = 86400;
/** ~5y of weekday bars ending 2026-10-16, price grows 10%/yr, with quarterly $1 distributions. */
function series(years = 5, annual = 0.1): HistoryJson {
  const end = Date.UTC(2026, 9, 16) / 1000;
  const t: number[] = [];
  const c: number[] = [];
  const a: number[] = [];
  const d: [number, number][] = [];
  const n = Math.round(years * 365);
  for (let i = n; i >= 0; i--) {
    const ts = end - i * DAY;
    const dow = new Date(ts * 1000).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    t.push(ts);
    const v = 100 * (1 + annual) ** ((n - i) / 365);
    c.push(v);
    a.push(v);
  }
  for (let q = 0; q < years * 4; q++) d.push([end - q * 92 * DAY, 1]);
  return { t, c, a, d: d.reverse() };
}

describe("computeMetrics", () => {
  const m = computeMetrics(series())!;
  it("returns null for too-short history", () => {
    expect(computeMetrics({ t: [1, 2], c: [1, 1], a: [1, 1], d: [] })).toBeNull();
  });
  it("annualises multi-year returns correctly", () => {
    expect(m.returns["3Y"].total!).toBeCloseTo(0.1, 2);
    expect(m.returns["5Y"].total!).toBeCloseTo(0.1, 2);
  });
  it("leaves windows the history does not cover as null (never estimated)", () => {
    expect(m.returns["10Y"].total).toBeNull();
  });
  it("counts TTM distributions", () => {
    expect(m.dividends.ttmCount).toBe(4);
    expect(m.dividends.frequency).toBe("Quarterly");
    expect(m.dividends.ttmAmount).toBe(4);
  });
  it("computes 5Y distribution CAGR only when six years of source history are available", () => {
    expect(m.dividends.cagr5y).toBeNull();
    const longHistory = series(7);
    const end = longHistory.t[longHistory.t.length - 1];
    longHistory.d = Array.from({ length: 28 }, (_, q) => [end - q * 91.3125 * DAY, 1] as [number, number]).reverse();
    expect(computeMetrics(longHistory)!.dividends.cagr5y).toBeCloseTo(0, 2);
  });
  it("reports no NAV erosion for a rising price", () => {
    expect(m.erosion.level).toBe("None");
  });
  it("flags erosion when price falls", () => {
    expect(computeMetrics(series(5, -0.04))!.erosion.level).toBe("Moderate");
  });
  it("sharpe needs a risk-free rate and non-zero vol", () => {
    expect(sharpe(m, null)).toBeNull();
  });
});

describe("alignedStats", () => {
  it("gives beta 1 / corr 1 for identical series with noise", () => {
    const h = series(3);
    h.a = h.a.map((v, i) => v * (1 + 0.01 * Math.sin(i)));
    const r = alignedStats(h, h, 3);
    expect(r.beta).toBeCloseTo(1, 6);
    expect(r.corr).toBeCloseTo(1, 6);
  });
});
