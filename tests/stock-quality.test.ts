import { describe, expect, it } from "vitest";
import { computeStockQuality, stockGradeFor, type StockInputs } from "../src/lib/stock-quality";

const great: StockInputs = {
  price: 100, marketCap: 1.5e12, beta: 0.8, forwardPE: 17, trailingPE: 20, pegRatio: 1.3,
  operatingMargin: 0.32, profitMargin: 0.25, roe: 0.3, freeCashflow: 1.2e11, totalRevenue: 4e11,
  debtToEquity: 0.4, totalDebt: 5e10, totalCash: 8e10, ebitda: 1.5e11, currentRatio: 1.8,
  recMean: 1.7, analystCount: 40, targetMean: 125, dd1y: 0.12,
};

describe("stock quality grade", () => {
  it("maps score to grade bands", () => {
    expect(stockGradeFor(90)).toBe("A+");
    expect(stockGradeFor(89.9)).toBe("A");
    expect(stockGradeFor(80)).toBe("A");
    expect(stockGradeFor(65)).toBe("B");
    expect(stockGradeFor(50)).toBe("C");
    expect(stockGradeFor(35)).toBe("D");
    expect(stockGradeFor(34)).toBe("F");
  });
  it("grades a strong blue chip A or better with no caps", () => {
    const r = computeStockQuality(great);
    expect(["A+", "A"]).toContain(r.grade);
    expect(r.caps).toEqual([]);
    expect(r.pillars).toHaveLength(5);
    expect(r.coverage).toBeCloseTo(1, 9);
  });
  it("caps negative free cash flow at B and a loss-making business at C", () => {
    const fcf = computeStockQuality({ ...great, freeCashflow: -1e9 });
    expect(["B", "C", "D", "F"]).toContain(fcf.grade);
    expect(fcf.caps.join(" ")).toMatch(/free cash flow/i);
    const loss = computeStockQuality({ ...great, operatingMargin: -0.05 });
    expect(["C", "D", "F"]).toContain(loss.grade);
  });
  it("caps small companies at B and a falling knife at B", () => {
    expect(["B", "C", "D", "F"]).toContain(computeStockQuality({ ...great, marketCap: 5e9 }).grade);
    expect(computeStockQuality({ ...great, dd1y: 0.5 }).caps.join(" ")).toMatch(/40%/);
  });
  it("ignores analysts when fewer than 8 cover the stock", () => {
    const r = computeStockQuality({ ...great, analystCount: 3 });
    expect(r.pillars.find((p) => p.key === "analysts")!.score).toBeNull();
    expect(r.grade).not.toBeNull();
  });
  it("gives no grade when under 70% of the weight has data", () => {
    const r = computeStockQuality({ ...great, operatingMargin: null, roe: null, freeCashflow: null, debtToEquity: null, totalDebt: null, currentRatio: null, forwardPE: null, pegRatio: null });
    expect(r.grade).toBeNull();
    expect(r.summary).toMatch(/Not enough data/);
  });
  it("is deterministic and independent of other stocks", () => {
    expect(computeStockQuality(great)).toEqual(computeStockQuality({ ...great }));
  });
});
