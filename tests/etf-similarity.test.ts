import { describe, expect, it } from "vitest";
import { buildEtfSimilarityGroups } from "@/lib/etf-similarity";
import type { HistoryJson } from "@/db/schema";

function makeHistory(values: number[], start = 1_600_000_000): HistoryJson {
  const day = 86400;
  return { t: values.map((_, i) => start + i * day), c: values, a: values, d: [] };
}
const holdings = (symbols: string[]) => symbols.map((symbol) => ({ symbol, weight: 0.2 }));

describe("ETF similarity groups", () => {
  it("groups funds on a strong five-year adjusted-return correlation", () => {
    const values = Array.from({ length: 1900 }, (_, i) => 100 + i + 3 * Math.sin(i / 9));
    const history = makeHistory(values);
    const result = buildEtfSimilarityGroups(
      [{ ticker: "AAA" }, { ticker: "BBB" }],
      { AAA: history, BBB: history },
    );

    expect(result.eligibleCorrelationPairs).toBe(1);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].members).toEqual(["AAA", "BBB"]);
    expect(result.groups[0].pairs[0].correlation5y).toBeCloseTo(1, 8);
    expect(result.groups[0].pairs[0].evidence).toContain("return-correlation");
  });

  it("uses the sum of minimum top-holding weights as a lower-bound overlap", () => {
    const result = buildEtfSimilarityGroups(
      [
        { ticker: "AAA", holdings: holdings(["AAPL", "MSFT", "NVDA", "AMZN", "META"]) },
        { ticker: "BBB", holdings: holdings(["AAPL", "MSFT", "NVDA", "AMZN", "TSLA"]) },
      ],
      {},
    );

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].pairs[0].top10Overlap).toBeCloseTo(0.8, 9);
    expect(result.groups[0].pairs[0].commonHoldings.map((holding) => holding.symbol)).toEqual(["AAPL", "MSFT", "NVDA", "AMZN"]);
    expect(result.groups[0].pairs[0].evidence).toEqual(["top-10-holdings"]);
  });

  it("requires at least five weighted holdings before treating overlap as evidence", () => {
    const result = buildEtfSimilarityGroups(
      [
        { ticker: "AAA", holdings: [{ symbol: "AAPL", weight: 0.6 }] },
        { ticker: "BBB", holdings: [{ symbol: "AAPL", weight: 0.6 }] },
      ],
      {},
    );
    expect(result.groups).toHaveLength(0);
    expect(result.holdingsPairs).toBe(0);
  });

  it("does not compute a five-year correlation for shorter stored histories", () => {
    const short = makeHistory(Array.from({ length: 500 }, (_, i) => 100 + i));
    const result = buildEtfSimilarityGroups([{ ticker: "AAA" }, { ticker: "BBB" }], { AAA: short, BBB: short });
    expect(result.eligibleCorrelationPairs).toBe(0);
    expect(result.groups).toHaveLength(0);
  });

  it("retains every qualifying direct edge inside a transitive group", () => {
    const fund = (ticker: string, symbols: string[]) => ({ ticker, holdings: holdings(symbols) });
    const result = buildEtfSimilarityGroups(
      [
        fund("AAA", ["AAPL", "MSFT", "NVDA", "AMZN", "META"]),
        fund("BBB", ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA"]),
        fund("CCC", ["AAPL", "MSFT", "NVDA", "GOOG", "TSLA"]),
      ],
      {},
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].members).toEqual(["AAA", "BBB", "CCC"]);
    expect(result.groups[0].pairs).toHaveLength(3);
  });
});
