import { describe, expect, it } from "vitest";
import type { ScreenRow } from "@/types/liveScreener";
import { filterLiveEtfs, sortLiveEtfs, type LiveScreenerFilters } from "@/lib/live-etf-screener";

function row(ticker: string, over: Partial<ScreenRow> = {}): ScreenRow {
  return {
    ticker,
    name: `${ticker} ETF`,
    category: "Large Blend",
    family: "Index Funds",
    leveraged: false,
    assetClass: "Equity",
    rateTag: "neutral",
    rateLabel: "Rate neutral",
    quality: "A",
    qualityScore: 95,
    price: 100,
    changePct: 0.01,
    expense: 0.0003,
    yieldTtm: 0.015,
    aum: 1_000_000_000,
    ytd: 0.05,
    r1y: 0.1,
    r3y: 0.08,
    r5y: 0.07,
    vol3y: 0.15,
    dd3y: -0.2,
    sharpe: 0.8,
    erosion: "None",
    priceRet3y: 0.04,
    capFunded: 0,
    divCagr3y: 0.03,
    divCagr5y: 0.025,
    lastExDate: "2026-09-20",
    analystRec: null,
    analystCoverage: null,
    freq: "Quarterly",
    ...over,
  };
}

const defaults: LiveScreenerFilters = { category: "ALL", minYieldPct: 0, maxExpensePct: 1, erosion: "ALL", frequency: "ALL" };

describe("live ETF screener filters and sorting", () => {
  it("filters using provider decimals while accepting percentage slider values", () => {
    const rows = [row("HIGH-YIELD", { yieldTtm: 0.04, expense: 0.0005 }), row("LOW-YIELD", { yieldTtm: 0.005, expense: 0.0002 }), row("HIGH-FEE", { yieldTtm: 0.04, expense: 0.003 })];
    const filtered = filterLiveEtfs(rows, { ...defaults, minYieldPct: 1, maxExpensePct: 0.1 });
    expect(filtered.map((fund) => fund.ticker)).toEqual(["HIGH-YIELD"]);
  });

  it("keeps unknown fees visible by default but does not treat them as meeting a stricter cap", () => {
    const rows = [row("KNOWN", { expense: 0.0005 }), row("UNKNOWN", { expense: null })];
    expect(filterLiveEtfs(rows, defaults).map((fund) => fund.ticker)).toEqual(["KNOWN", "UNKNOWN"]);
    expect(filterLiveEtfs(rows, { ...defaults, maxExpensePct: 0.5 }).map((fund) => fund.ticker)).toEqual(["KNOWN"]);
  });

  it("filters by provider category, real distribution frequency, and erosion severity", () => {
    const rows = [
      row("A", { category: "Large Blend", freq: "Monthly", erosion: "None" }),
      row("B", { category: "Large Growth", freq: "Quarterly", erosion: "Severe" }),
    ];
    const filtered = filterLiveEtfs(rows, { ...defaults, category: "Large Blend", frequency: "Monthly", erosion: "PRUDENT_ONLY" });
    expect(filtered.map((fund) => fund.ticker)).toEqual(["A"]);
  });

  it("sorts erosion in severity order and keeps unavailable classifications last", () => {
    const rows = [row("UNKNOWN", { erosion: "n/a" }), row("SEVERE", { erosion: "Severe" }), row("MODERATE", { erosion: "Moderate" }), row("MILD", { erosion: "Mild" }), row("NONE", { erosion: "None" })];
    expect(sortLiveEtfs(rows, "erosion", "asc").map((fund) => fund.ticker)).toEqual(["NONE", "MILD", "MODERATE", "SEVERE", "UNKNOWN"]);
  });

  it("sorts numeric values and keeps missing metrics last in either direction", () => {
    const rows = [row("MISSING", { yieldTtm: null }), row("LOW", { yieldTtm: 0.01 }), row("HIGH", { yieldTtm: 0.03 })];
    expect(sortLiveEtfs(rows, "yieldTtm", "desc").map((fund) => fund.ticker)).toEqual(["HIGH", "LOW", "MISSING"]);
    expect(sortLiveEtfs(rows, "yieldTtm", "asc").map((fund) => fund.ticker)).toEqual(["LOW", "HIGH", "MISSING"]);
  });
});
