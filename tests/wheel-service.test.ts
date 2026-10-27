import { beforeAll, describe, expect, it } from "vitest";

// The pool connects lazily, so a dummy URL lets us import the module for its pure helpers.
let m: typeof import("../src/lib/wheel-service");
beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://x:x@127.0.0.1:1/x";
  m = await import("../src/lib/wheel-service");
});

describe("matchesWheelGrade", () => {
  it("uses inclusive minimum-grade semantics and supports exact matches", () => {
    expect(m.matchesWheelGrade("A+", "B", "minimum")).toBe(true);
    expect(m.matchesWheelGrade("A", "B", "minimum")).toBe(true);
    expect(m.matchesWheelGrade("B", "B", "minimum")).toBe(true);
    expect(m.matchesWheelGrade("C", "B", "minimum")).toBe(false);
    expect(m.matchesWheelGrade("A", "A", "exact")).toBe(true);
    expect(m.matchesWheelGrade("A+", "A", "exact")).toBe(false);
    expect(m.matchesWheelGrade("F", "all", "exact")).toBe(true);
    expect(m.matchesWheelGrade(null, "all", "minimum")).toBe(false);
  });
});

describe("comparePutCandidates", () => {
  const higherScore = { score: 80, annRoc: 0.1 };
  const higherReturn = { score: 50, annRoc: 0.25 };
  it("ranks by overall score or annualized ROC with a sensible tie-break", () => {
    expect(m.comparePutCandidates(higherScore, higherReturn, "score")).toBeLessThan(0);
    expect(m.comparePutCandidates(higherScore, higherReturn, "annRoc")).toBeGreaterThan(0);
    expect(m.comparePutCandidates({ score: 80, annRoc: 0.12 }, { score: 80, annRoc: 0.1 }, "score")).toBeLessThan(0);
  });
});

describe("scanIsStale", () => {
  const tue11et = new Date("2026-10-20T15:00:00Z"); // market open
  const sat = new Date("2026-10-24T15:00:00Z"); // closed
  it("is stale when never scanned", () => expect(m.scanIsStale(null, tue11et)).toBe(true));
  it("uses a 20 minute TTL during market hours", () => {
    expect(m.scanIsStale(new Date(tue11et.getTime() - 10 * 60_000), tue11et)).toBe(false);
    expect(m.scanIsStale(new Date(tue11et.getTime() - 30 * 60_000), tue11et)).toBe(true);
  });
  it("uses a 4 hour TTL when the market is closed", () => {
    expect(m.scanIsStale(new Date(sat.getTime() - 2 * 3_600_000), sat)).toBe(false);
    expect(m.scanIsStale(new Date(sat.getTime() - 5 * 3_600_000), sat)).toBe(true);
  });
});

describe("stockCtx", () => {
  const row = {
    ticker: "AAA", price: 100,
    technicals: { hv30: 0.2, sma200: 95, supports: [{ price: 90 }, { price: 85 }] },
    events: { nextEarnings: "2026-12-01", earningsEstimated: true, exDividend: null, dividendPerShare: 1, dividendYield: 0.01 },
    fundamentals: { beta: 1.1 },
  };
  const g = { row, quality: {}, grade: "A" } as never;
  it("builds a context from stored data and prefers the live price", () => {
    const c = m.stockCtx(g, 105)!;
    expect(c.price).toBe(105);
    expect(c.supports).toEqual([90, 85]);
    expect(c.beta).toBe(1.1);
    expect(c.earningsEstimated).toBe(true);
    expect(m.stockCtx(g, null)!.price).toBe(100);
  });
  it("returns null without a price or technicals", () => {
    expect(m.stockCtx({ row: { ...row, price: null }, quality: {}, grade: "A" } as never, null)).toBeNull();
    expect(m.stockCtx({ row: { ...row, technicals: null }, quality: {}, grade: "A" } as never, 100)).toBeNull();
  });
});
