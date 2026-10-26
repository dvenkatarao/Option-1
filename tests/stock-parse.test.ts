import { describe, expect, it } from "vitest";
import { parseStockSummary } from "../src/lib/stock-parse";

const qs = {
  price: { longName: "Acme Corp", marketCap: { raw: 3e11 } },
  assetProfile: { sector: "Technology", industry: "Software" },
  financialData: {
    currentPrice: { raw: 100 }, operatingMargins: { raw: 0.3 }, profitMargins: { raw: 0.25 }, returnOnEquity: { raw: 0.4 },
    freeCashflow: { raw: 5e10 }, totalRevenue: { raw: 2e11 }, debtToEquity: { raw: 154 }, recommendationMean: { raw: 1.9 },
    numberOfAnalystOpinions: { raw: 40 }, targetMeanPrice: { raw: 120 },
  },
  defaultKeyStatistics: { beta: { raw: 1.1 }, forwardPE: { raw: 22 }, pegRatio: { raw: 1.4 } },
  summaryDetail: { dividendRate: { raw: 2.4 }, dividendYield: { raw: 0.024 }, exDividendDate: { raw: 1_792_000_000 } },
  calendarEvents: { earnings: { earningsDate: [{ raw: 1_793_000_000 }, { raw: 1_793_600_000 }] } },
};

describe("parseStockSummary", () => {
  it("maps fields and converts debt/equity from percent", () => {
    const p = parseStockSummary(qs, null);
    expect(p.name).toBe("Acme Corp");
    expect(p.fundamentals.debtToEquity).toBeCloseTo(1.54, 5);
    expect(p.fundamentals.marketCap).toBe(3e11);
    expect(p.fundamentals.analystCount).toBe(40);
    expect(p.sector).toBe("Technology");
  });
  it("uses the earliest earnings date and flags a date window as estimated", () => {
    const p = parseStockSummary(qs, null);
    expect(p.events.nextEarnings).toBe(new Date(1_793_000_000 * 1000).toISOString().slice(0, 10));
    expect(p.events.earningsEstimated).toBe(true);
    expect(p.events.exDividend).toBe(new Date(1_792_000_000 * 1000).toISOString().slice(0, 10));
  });
  it("a single date is treated as confirmed", () => {
    const p = parseStockSummary({ ...qs, calendarEvents: { earnings: { earningsDate: [{ raw: 1_793_000_000 }] } } }, null);
    expect(p.events.earningsEstimated).toBe(false);
  });
  it("leaves missing values null instead of guessing", () => {
    const p = parseStockSummary({}, null);
    expect(p.fundamentals.forwardPE).toBeNull();
    expect(p.events.nextEarnings).toBeNull();
    expect(p.fundamentals.price).toBeNull();
  });
});
