import { describe, expect, it } from "vitest";
import { evaluateStockThresholds, type StockThresholds } from "../src/lib/stock-presets";
import type { StockInputs } from "../src/lib/stock-quality";

const base: StockInputs = {
  price: 100,
  marketCap: 2e10,
  beta: 1.1,
  forwardPE: 18,
  trailingPE: 20,
  pegRatio: 1.5,
  operatingMargin: 0.2,
  profitMargin: 0.15,
  roe: 0.18,
  freeCashflow: 1e9,
  totalRevenue: 1e10,
  debtToEquity: 0.8,
  totalDebt: 5e9,
  totalCash: 2e9,
  ebitda: 3e9,
  currentRatio: 1.4,
  recMean: 2.0,
  analystCount: 20,
  targetMean: 110,
  dd1y: 0.2,
};

const t: StockThresholds = { roeMin: 0.15, forwardPEMax: 20, betaMax: 1.3 };

describe("evaluateStockThresholds", () => {
  it("passes when every filtered field is present and in range", () => {
    const r = evaluateStockThresholds(base, t, "exclude");
    expect(r.pass).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it("excludes a name when a filtered field is missing", () => {
    const r = evaluateStockThresholds({ ...base, roe: null }, t, "exclude");
    expect(r.pass).toBe(false);
    expect(r.missing).toContain("ROE");
  });
  it("keeps a name when the user opts in and other fields still pass", () => {
    const r = evaluateStockThresholds({ ...base, roe: null }, t, "keep");
    expect(r.pass).toBe(true);
    expect(r.missing).toContain("ROE");
  });
  it("still fails on a real miss even when keep is on", () => {
    const r = evaluateStockThresholds({ ...base, forwardPE: 40 }, t, "keep");
    expect(r.pass).toBe(false);
    expect(r.missing).toEqual([]);
  });
  it("treats missing P/E, PEG, beta and drawdown the same as missing ROE", () => {
    for (const patch of [{ forwardPE: null }, { pegRatio: null }, { beta: null }, { dd1y: null }] as Partial<StockInputs>[]) {
      const exclude = evaluateStockThresholds({ ...base, ...patch }, { forwardPEMax: 20, pegMax: 2, betaMax: 1.3, ddMax: 0.25 }, "exclude");
      expect(exclude.pass).toBe(false);
      expect(exclude.missing.length).toBeGreaterThan(0);
    }
  });
});
