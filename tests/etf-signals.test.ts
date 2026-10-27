import { describe, expect, it } from "vitest";
import { computeEtfTrendSignal, ETF_TREND_METHODOLOGY } from "@/lib/etf-signals";
import type { HistoryJson } from "@/db/schema";

function history(closes: number[]): HistoryJson {
  return {
    t: closes.map((_, i) => 1_700_000_000 + i * 86400),
    c: closes,
    a: closes,
    d: [],
  };
}

describe("stored-history ETF trend signals", () => {
  it("uses the documented moving-average alignment for an uptrend", () => {
    const signal = computeEtfTrendSignal(history(Array.from({ length: 240 }, (_, i) => 100 + i)));
    expect(signal.state).toBe("uptrend");
    expect(signal.aboveSma50).toBe(true);
    expect(signal.aboveSma200).toBe(true);
    expect(signal.movingAverageAlignment).toBe("50d-above-200d");
    expect(signal.bars).toBe(240);
    expect(signal.asOf).not.toBeNull();
  });

  it("classifies the same rule in a downtrend and keeps RSI separate", () => {
    const signal = computeEtfTrendSignal(history(Array.from({ length: 240 }, (_, i) => 400 - i)));
    expect(signal.state).toBe("downtrend");
    expect(signal.rsi14).toBe(0);
    expect(signal.rsiState).toBe("oversold");
  });

  it("does not invent a trend when 200 closes are unavailable", () => {
    const signal = computeEtfTrendSignal(history(Array.from({ length: 199 }, (_, i) => 100 + Math.sin(i))));
    expect(signal.state).toBe("insufficient");
    expect(signal.sma50).not.toBeNull();
    expect(signal.sma200).toBeNull();
    expect(signal.rsi14).not.toBeNull();
  });

  it("returns explicit missing-data state and methodology", () => {
    const signal = computeEtfTrendSignal(null);
    expect(signal.state).toBe("insufficient");
    expect(signal.rsiState).toBe("unavailable");
    expect(signal.methodology).toBe(ETF_TREND_METHODOLOGY);
  });
});
