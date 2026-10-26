import { describe, expect, it } from "vitest";
import { computeDrift } from "../src/lib/portfolio-rebalance";

describe("computeDrift", () => {
  it("computes drift vs target and flags buy/sell", () => {
    const actual = [
      { assetClass: "Equities / Stocks", weight: 0.8, marketValue: 80 },
      { assetClass: "Fixed Income / Bonds", weight: 0.2, marketValue: 20 },
    ];
    const target = { "Equities / Stocks": 0.6, "Fixed Income / Bonds": 0.4 };
    const drift = computeDrift(actual as any, target, 100);
    const eq = drift.find((d) => d.assetClass === "Equities / Stocks")!;
    expect(eq.driftWeight).toBeCloseTo(-0.2);
    expect(eq.action).toBe("sell");
    const bond = drift.find((d) => d.assetClass === "Fixed Income / Bonds")!;
    expect(bond.action).toBe("buy");
  });
});
