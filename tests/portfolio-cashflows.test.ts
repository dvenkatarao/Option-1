import { describe, expect, it } from "vitest";
import { computeCashFlowSummary, xirr, depositAwarePerformance } from "../src/lib/portfolio-cashflows";

describe("computeCashFlowSummary", () => {
  it("tracks deposits/withdrawals and realized FIFO gains", () => {
    const txs: any[] = [
      { id: "1", portfolioId: "p", ticker: null, type: "DEPOSIT", quantity: null, price: null, amount: 10000, fee: 0, transactionDate: "2024-01-01", notes: null, createdAt: new Date("2024-01-01") },
      { id: "2", portfolioId: "p", ticker: "VOO", type: "BUY", quantity: 10, price: 100, amount: 1000, fee: 1, transactionDate: "2024-01-02", notes: null, createdAt: new Date("2024-01-02") },
      { id: "3", portfolioId: "p", ticker: "VOO", type: "BUY", quantity: 10, price: 110, amount: 1100, fee: 0, transactionDate: "2024-01-03", notes: null, createdAt: new Date("2024-01-03") },
      { id: "4", portfolioId: "p", ticker: "VOO", type: "SELL", quantity: 10, price: 120, amount: 1200, fee: 0, transactionDate: "2024-01-04", notes: null, createdAt: new Date("2024-01-04") },
      { id: "5", portfolioId: "p", ticker: null, type: "DIVIDEND", quantity: null, price: null, amount: 50, fee: 0, transactionDate: "2024-01-05", notes: null, createdAt: new Date("2024-01-05") },
    ];
    const cf = computeCashFlowSummary(txs);
    expect(cf.totalDeposits).toBe(10000);
    expect(cf.totalDividends).toBe(50);
    expect(cf.tradeCount.buys).toBe(2);
    expect(cf.tradeCount.sells).toBe(1);
    // FIFO: first lot 10@100+fee 1 => 100.1 per share? Actually fee 1 spread across 10 => 100.1
    // cost removed ~1001, proceeds 1200 => gain ~199
    expect(cf.realizedGain).toBeCloseTo(199, 0);
    expect(cf.sellCostRemoved).toBeCloseTo(1001, 0);
  });
});

describe("depositAwarePerformance", () => {
  it("computes gain vs deposits", () => {
    const cf = { netDeposits: 10000, totalDividends: 0, totalFees: 0, realizedGain: 0 } as any;
    const perf = depositAwarePerformance(12000, cf);
    expect(perf.GainVsDeposits).toBe(2000);
    expect(perf.GainVsDepositsPct).toBeCloseTo(0.2);
  });
});

describe("xirr", () => {
  it("solves simple 10% case", () => {
    const flows = [
      { date: "2024-01-01", amount: -1000 },
      { date: "2025-01-01", amount: 1100 },
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 2);
  });
  it("returns null for no bracket", () => {
    expect(xirr([{ date: "2024-01-01", amount: -100 }])).toBeNull();
  });
});
