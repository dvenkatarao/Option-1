import { describe, expect, it } from "vitest";
import { netCredit, positionPnl, presetLegs, summarizePayoff, type Leg } from "../src/lib/option-payoff";

const put = (strike: number, premium: number, side: "buy" | "sell" = "sell"): Leg => ({
  id: `${side}-${strike}`,
  side,
  right: "put",
  strike,
  premium,
  qty: 1,
});
const call = (strike: number, premium: number, side: "buy" | "sell" = "sell"): Leg => ({
  id: `${side}c-${strike}`,
  side,
  right: "call",
  strike,
  premium,
  qty: 1,
});

describe("short put", () => {
  it("max profit = credit, BE = strike − credit, max loss at zero", () => {
    const legs = [put(95, 1.02)];
    expect(netCredit(legs)).toBeCloseTo(102, 6);
    expect(positionPnl(legs, 100)).toBeCloseTo(102, 6);
    expect(positionPnl(legs, 95)).toBeCloseTo(102, 6);
    expect(positionPnl(legs, 93.98)).toBeCloseTo(0, 6);
    expect(positionPnl(legs, 0)).toBeCloseTo(102 - 9500, 6);
    const s = summarizePayoff(legs, 100);
    expect(s.maxProfit).toBeCloseTo(102, 4);
    expect(s.maxLoss).toBeCloseTo(102 - 9500, 4);
    expect(s.breakevens[0]).toBeCloseTo(93.98, 1);
    expect(s.profitUnbounded).toBe(false);
  });
});

describe("put credit spread", () => {
  it("caps loss at width − credit", () => {
    const legs = [put(95, 1.5), put(90, 0.5, "buy")];
    expect(netCredit(legs)).toBeCloseTo(100, 6);
    expect(positionPnl(legs, 100)).toBeCloseTo(100, 6);
    expect(positionPnl(legs, 90)).toBeCloseTo(100 - 500, 6);
    expect(positionPnl(legs, 0)).toBeCloseTo(100 - 500, 6);
    const s = summarizePayoff(legs, 100);
    expect(s.maxProfit).toBeCloseTo(100, 4);
    expect(s.maxLoss).toBeCloseTo(-400, 4);
    expect(s.lossUnbounded).toBe(false);
  });
});

describe("iron condor", () => {
  it("matches width − credit on both wings", () => {
    const legs = [put(95, 1.2), put(90, 0.4, "buy"), call(105, 1.2), call(110, 0.4, "buy")];
    expect(netCredit(legs)).toBeCloseTo(160, 6);
    const s = summarizePayoff(legs, 100);
    expect(s.maxProfit).toBeCloseTo(160, 4);
    expect(s.maxLoss).toBeCloseTo(160 - 500, 4);
    expect(s.breakevens.length).toBe(2);
  });
});

describe("covered call", () => {
  it("caps upside at the short call", () => {
    const legs: Leg[] = [
      { id: "s", side: "buy", right: "stock", strike: null, premium: 100, qty: 1 },
      call(105, 2),
    ];
    expect(positionPnl(legs, 105)).toBeCloseTo((105 - 100 + 2) * 100, 6);
    expect(positionPnl(legs, 120)).toBeCloseTo((105 - 100 + 2) * 100, 6);
    const s = summarizePayoff(legs, 100);
    expect(s.maxProfit).toBeCloseTo(700, 4);
    expect(s.profitUnbounded).toBe(false);
  });
});

describe("presets", () => {
  it("builds five named structures", () => {
    expect(presetLegs("short-put", 100)).toHaveLength(1);
    expect(presetLegs("covered-call", 100)).toHaveLength(2);
    expect(presetLegs("put-credit", 100)).toHaveLength(2);
    expect(presetLegs("call-credit", 100)).toHaveLength(2);
    expect(presetLegs("iron-condor", 100)).toHaveLength(4);
  });
});
