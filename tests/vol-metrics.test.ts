import { describe, expect, it } from "vitest";
import { capitalForMonthlyIncome, dteBucket, expectedMove, expectedMovePct, sigmaDistance, summarizeDteBuckets, vrpPp } from "../src/lib/vol-metrics";

describe("expectedMove", () => {
  it("uses price × vol × √(DTE/365)", () => {
    const em = expectedMove(100, 0.25, 30);
    expect(em).not.toBeNull();
    const one = 100 * 0.25 * Math.sqrt(30 / 365);
    expect(em!.one).toBeCloseTo(one, 9);
    expect(em!.low1).toBeCloseTo(100 - one, 9);
    expect(em!.high1).toBeCloseTo(100 + one, 9);
    expect(em!.two).toBeCloseTo(2 * one, 9);
  });
  it("returns null on unusable inputs", () => {
    expect(expectedMove(0, 0.2, 30)).toBeNull();
    expect(expectedMove(100, null, 30)).toBeNull();
    expect(expectedMovePct(0.2, 0)).toBeNull();
  });
});

describe("vrp and sigma", () => {
  it("reports IV − HV in percentage points", () => {
    expect(vrpPp(0.28, 0.2)).toBeCloseTo(8, 9);
    expect(vrpPp(null, 0.2)).toBeNull();
  });
  it("measures strike distance in expected-move units", () => {
    expect(sigmaDistance(100, 95, 0.05)).toBeCloseTo(1, 9);
    expect(sigmaDistance(100, 95, null)).toBeNull();
  });
});

describe("DTE buckets and income", () => {
  it("assigns 45 DTE to the 45d bucket", () => {
    expect(dteBucket(45)).toBe("45");
    expect(dteBucket(7)).toBe("7");
    expect(dteBucket(200)).toBeNull();
  });
  it("summarises median credit per bucket", () => {
    const rows = [
      { dte: 30, credit: 1, spreadPct: 0.05, oi: 200, iv: 0.2 },
      { dte: 32, credit: 1.2, spreadPct: 0.04, oi: 400, iv: 0.22 },
      { dte: 45, credit: 1.5, spreadPct: 0.06, oi: 100, iv: 0.25 },
    ];
    const b = summarizeDteBuckets(rows);
    const d30 = b.find((x) => x.key === "30")!;
    expect(d30.n).toBe(2);
    expect(d30.medianCredit).toBeCloseTo(1.1, 9);
    expect(b.find((x) => x.key === "45")!.n).toBe(1);
  });
  it("sizes capital from a monthly income target", () => {
    const r = capitalForMonthlyIncome(500, 0.01, 30);
    expect(r).not.toBeNull();
    expect(r!.cyclesPerYear).toBeCloseTo(365 / 30, 9);
    expect(r!.capital).toBeCloseTo((500 * 12) / (0.01 * (365 / 30)), 6);
  });
});
