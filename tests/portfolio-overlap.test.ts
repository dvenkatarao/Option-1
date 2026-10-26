import { describe, expect, it } from "vitest";
import { buildOverlapMatrix } from "../src/lib/portfolio-overlap";

describe("portfolio overlap", () => {
  it("computes overlap as sum of mins over common holdings", () => {
    const holdings = new Map([
      ["VOO", [{ symbol: "AAPL", weight: 0.07 }, { symbol: "MSFT", weight: 0.06 }]],
      ["QQQ", [{ symbol: "AAPL", weight: 0.1 }, { symbol: "NVDA", weight: 0.05 }]],
    ]);
    const cells = buildOverlapMatrix(["VOO", "QQQ"], holdings as any);
    const pair = cells.find((c) => (c.a === "VOO" && c.b === "QQQ") || (c.a === "QQQ" && c.b === "VOO"))!;
    expect(pair.overlap).toBeCloseTo(0.07); // min(0.07,0.1) for AAPL
    expect(pair.common[0].symbol).toBe("AAPL");
  });
  it("diagonal is 100%", () => {
    const holdings = new Map([["VOO", [{ symbol: "AAPL", weight: 0.07 }]]]);
    const cells = buildOverlapMatrix(["VOO"], holdings as any);
    expect(cells[0].overlap).toBe(1);
  });
});
