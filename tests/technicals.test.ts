import { describe, expect, it } from "vitest";
import { anchoredVwap, atr, bollinger, computeTechnicals, emaSeries, historicalVol, macd, maxDrawdown, rsi, sessionVwap, sma, supportResistance, vwma, type Bar } from "../src/lib/technicals";

const bar = (i: number, c: number, spread = 0.5, v = 1000): Bar => ({ t: 1_700_000_000 + i * 86400, o: c, h: c + spread, l: c - spread, c, v });

describe("indicators", () => {
  it("RSI is 100 on a pure uptrend, 50 when flat, low on a downtrend", () => {
    expect(rsi(Array.from({ length: 40 }, (_, i) => 100 + i))).toBe(100);
    expect(rsi(Array.from({ length: 40 }, () => 100))).toBe(50);
    expect(rsi(Array.from({ length: 40 }, (_, i) => 100 - i))!).toBeLessThan(1);
    expect(rsi([1, 2, 3])).toBeNull();
  });
  it("RSI matches a hand-computed Wilder value", () => {
    // 15 closes: 14 changes alternating +1 / -0.5 => avg gain 0.5, avg loss 0.25 over the seed window => RS 2 => RSI 66.67
    const closes = [100];
    for (let i = 0; i < 14; i++) closes.push(closes[closes.length - 1] + (i % 2 === 0 ? 1 : -0.5));
    expect(rsi(closes, 14)!).toBeCloseTo(100 - 100 / (1 + (7 / 14) / (3.5 / 14)), 6);
  });
  it("SMA and EMA of a constant series equal the constant", () => {
    const flat = Array.from({ length: 60 }, () => 50);
    expect(sma(flat, 20)).toBe(50);
    expect(emaSeries(flat, 21)[59]).toBeCloseTo(50, 9);
  });
  it("MACD is bullish on a rising series and flags a fresh bearish cross", () => {
    const up = Array.from({ length: 80 }, (_, i) => 100 * Math.pow(1.01, i));
    expect(macd(up)!.state).toBe("bullish");
    expect(macd(up.slice(0, 20))).toBeNull();
    // rise then sharp fall: the histogram must change sign at some point
    const top = up[up.length - 1];
    const s = [...up, ...Array.from({ length: 15 }, (_, i) => top - i * 4)];
    let crossed = false;
    for (let n = 60; n <= s.length; n++) if (macd(s.slice(0, n))?.crossed === "down") crossed = true;
    expect(crossed).toBe(true);
  });
  it("Bollinger of a constant series is degenerate at the middle", () => {
    const b = bollinger(Array.from({ length: 30 }, () => 10))!;
    expect(b.pctB).toBe(0.5);
    expect(b.bandwidth).toBe(0);
  });
  it("VWMA weights by volume; anchored VWAP uses typical price", () => {
    const bars = [bar(0, 10, 0, 100), bar(1, 20, 0, 300)];
    expect(vwma(bars, 2)).toBeCloseTo((10 * 100 + 20 * 300) / 400, 9);
    expect(anchoredVwap(bars, 1)).toBeCloseTo(20, 9);
    expect(anchoredVwap(bars, 5)).toBeNull();
  });
  it("session VWAP only uses the last session", () => {
    const day1 = [{ t: 1_700_000_000, o: 1, h: 1, l: 1, c: 1, v: 100 }];
    const day2 = [{ t: 1_700_000_000 + 2 * 86400, o: 9, h: 9, l: 9, c: 9, v: 100 }];
    expect(sessionVwap([...day1, ...day2])).toBeCloseTo(9, 9);
    expect(sessionVwap([])).toBeNull();
  });
  it("ATR of constant-range bars equals the range", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 100, 1));
    expect(atr(bars, 14)).toBeCloseTo(2, 9);
  });
  it("historical vol is zero for a flat series and max drawdown is exact", () => {
    expect(historicalVol(Array.from({ length: 40 }, () => 100), 30)).toBe(0);
    expect(maxDrawdown([100, 120, 90, 110])).toBeCloseTo(0.25, 9);
  });
});

describe("support and resistance", () => {
  it("finds a floor and a ceiling in a range-bound market", () => {
    // 100 + 10 sin: swing highs ~110.5 and lows ~89.5 repeat every ~38 bars; end near the middle
    const bars = Array.from({ length: 230 }, (_, i) => bar(i, 100 + 10 * Math.sin(i / 6)));
    const last = bars[bars.length - 1].c;
    const { supports, resistances } = supportResistance(bars);
    expect(supports.length).toBeGreaterThan(0);
    expect(resistances.length).toBeGreaterThan(0);
    expect(supports[0].price).toBeLessThan(last);
    expect(supports[0].price).toBeGreaterThan(87);
    expect(supports[0].price).toBeLessThan(93);
    expect(resistances[0].price).toBeGreaterThan(last);
    expect(resistances[0].touches).toBeGreaterThanOrEqual(2);
  });
  it("returns nothing when there is too little data", () => {
    expect(supportResistance(Array.from({ length: 5 }, (_, i) => bar(i, 100)))).toEqual({ supports: [], resistances: [] });
  });
});

describe("computeTechnicals", () => {
  it("builds a full snapshot from 300 bars and refuses thin data", () => {
    const bars = Array.from({ length: 300 }, (_, i) => bar(i, 100 + i * 0.1 + 5 * Math.sin(i / 8), 0.6, 1000 + (i % 7) * 100));
    const t = computeTechnicals(bars)!;
    expect(t.rsi14).not.toBeNull();
    expect(t.sma200).not.toBeNull();
    expect(t.vwma20).not.toBeNull();
    expect(t.vwapFrom52wLow).not.toBeNull();
    expect(t.aboveSma200).toBe(true);
    expect(t.maCross).toBe("golden");
    expect(t.hi52!).toBeGreaterThanOrEqual(t.price);
    expect(computeTechnicals(bars.slice(0, 30))).toBeNull();
  });
});
