import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, accountFit, daysBetween, earningsStatus, evaluateCall, evaluatePut, scanPuts, type OptionContract, type StockCtx } from "../src/lib/wheel";

const TODAY = "2026-10-21";
const stock: StockCtx = { ticker: "XYZ", price: 100, nextEarnings: "2026-12-15", earningsEstimated: false, exDividend: null, dividendPerShare: null, dividendYield: null, beta: 1, hv30: 0.2, sma200: 95, supports: [96, 90] };
const put = (o: Partial<OptionContract> = {}): OptionContract => ({ symbol: "XYZ261120P00095000", type: "put", strike: 95, expiration: "2026-11-20", bid: 1.0, ask: 1.08, last: 1.04, delta: -0.2, deltaSource: "provider", iv: 0.25, oi: 800, volume: 50, source: "alpaca", ...o });
const call = (o: Partial<OptionContract> = {}): OptionContract => ({ symbol: "XYZ261120C00105000", type: "call", strike: 105, expiration: "2026-11-20", bid: 1.0, ask: 1.08, last: 1.04, delta: 0.25, deltaSource: "provider", iv: 0.25, oi: 800, volume: 50, source: "alpaca", ...o });

describe("dates and earnings", () => {
  it("counts days and classifies earnings relative to expiry", () => {
    expect(daysBetween("2026-10-21", "2026-11-20")).toBe(30);
    expect(earningsStatus("2026-11-10", "2026-11-20", TODAY)).toBe("inside");
    expect(earningsStatus("2026-11-20", "2026-11-20", TODAY)).toBe("inside");
    expect(earningsStatus("2026-12-15", "2026-11-20", TODAY)).toBe("clear");
    expect(earningsStatus(null, "2026-11-20", TODAY)).toBe("unknown");
    expect(earningsStatus("2026-09-01", "2026-11-20", TODAY)).toBe("unknown");
  });
});

describe("evaluatePut", () => {
  it("computes the premium math exactly", () => {
    const r = evaluatePut(put(), stock, DEFAULT_PARAMS, TODAY);
    if (!r.ok) throw new Error(r.reason);
    const c = r.cand;
    expect(c.dte).toBe(30);
    expect(c.credit).toBeCloseTo(1.02, 9);
    expect(c.mid).toBeCloseTo(1.04, 9);
    expect(c.cash).toBe(9500);
    expect(c.roc).toBeCloseTo(1.02 / (95 - 1.02), 9);
    expect(c.annRoc).toBeCloseTo((1.02 / 93.98) * (365 / 30), 9);
    expect(c.breakeven).toBeCloseTo(93.98, 9);
    expect(c.breakevenCushion).toBeCloseTo((100 - 93.98) / 100, 9);
    expect(c.probOtm).toBeCloseTo(0.8, 9);
    expect(c.supportAboveStrike).toBe(true); // 96 sits between strike 95 and price 100
    expect(c.earnings).toBe("clear");
    expect(c.score).toBeGreaterThan(0);
  });
  it("rejects each failing filter with its own reason", () => {
    const r = (o: Partial<OptionContract>, s: StockCtx = stock) => {
      const x = evaluatePut(put(o), s, DEFAULT_PARAMS, TODAY);
      return x.ok ? "ok" : x.reason;
    };
    expect(r({ bid: null })).toBe("no-quote");
    expect(r({ bid: 0 })).toBe("no-quote");
    expect(r({ delta: null })).toBe("no-quote");
    expect(r({ strike: 101 })).toBe("itm");
    expect(r({ expiration: "2026-10-25" })).toBe("dte");
    expect(r({ expiration: "2027-03-19" })).toBe("dte");
    expect(r({ delta: -0.05 })).toBe("delta");
    expect(r({ delta: -0.45 })).toBe("delta");
    expect(r({ oi: 20 })).toBe("oi");
    expect(r({ oi: null })).toBe("oi");
    expect(r({ bid: 0.5, ask: 1.5 })).toBe("spread");
    expect(r({ bid: 0.1, ask: 0.105 })).toBe("return");
    expect(r({}, { ...stock, nextEarnings: "2026-11-05" })).toBe("earnings");
  });
  it("lets earnings through when the box is ticked and penalises the score", () => {
    const s = { ...stock, nextEarnings: "2026-11-05" };
    const base = evaluatePut(put(), stock, DEFAULT_PARAMS, TODAY);
    const withE = evaluatePut(put(), s, { ...DEFAULT_PARAMS, allowEarnings: true }, TODAY);
    if (!base.ok || !withE.ok) throw new Error("expected ok");
    expect(withE.cand.earnings).toBe("inside");
    expect(withE.cand.score).toBeLessThan(base.cand.score);
  });
  it("flags unknown earnings without rejecting", () => {
    const r = evaluatePut(put(), { ...stock, nextEarnings: null }, DEFAULT_PARAMS, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.cand.earnings).toBe("unknown");
  });
  it("flags an ex-dividend date inside the window and a price below the 200-day", () => {
    const r = evaluatePut(put(), { ...stock, exDividend: "2026-11-05", sma200: 110 }, DEFAULT_PARAMS, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.cand.exDivInside).toBe(true);
    expect(r.cand.belowSma200).toBe(true);
  });
});

describe("scanPuts", () => {
  it("sorts by score and counts rejections", () => {
    const chain = [put(), put({ strike: 92, bid: 0.6, ask: 0.64, delta: -0.16, symbol: "B" }), put({ delta: -0.9, symbol: "C" }), call()];
    const s = scanPuts(chain, stock, DEFAULT_PARAMS, TODAY);
    expect(s.evaluated).toBe(3);
    expect(s.rejected.delta).toBe(1);
    expect(s.candidates.length).toBe(2);
    expect(s.candidates[0].score).toBeGreaterThanOrEqual(s.candidates[1].score);
  });
});

describe("evaluateCall", () => {
  it("requires the strike at or above cost and computes called-away return", () => {
    const below = evaluateCall(call({ strike: 105 }), stock, 110, DEFAULT_PARAMS, TODAY);
    expect(below.ok).toBe(false);
    const r = evaluateCall(call(), stock, 98, DEFAULT_PARAMS, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.cand.ifCalled).toBeCloseTo((105 - 98 + 1.02) / 98, 9);
    expect(r.cand.upsideToStrike).toBeCloseTo(0.05, 9);
  });
  it("flags high early-assignment risk for a near-the-money call with time value below the dividend", () => {
    const itm = call({ strike: 100, bid: 0.35, ask: 0.37, delta: 0.3 });
    const s = { ...stock, price: 99.9, exDividend: "2026-11-05", dividendPerShare: 0.9 };
    const r = evaluateCall(itm, s, 95, { ...DEFAULT_PARAMS, minAnnReturn: 0 }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.cand.earlyAssignmentRisk).toBe("high");
    const unknownDiv = evaluateCall(itm, { ...s, dividendPerShare: null }, 95, { ...DEFAULT_PARAMS, minAnnReturn: 0 }, TODAY);
    if (!unknownDiv.ok) throw new Error(unknownDiv.reason);
    expect(unknownDiv.cand.earlyAssignmentRisk).toBe("check");
  });
  it("only asks to watch (not high risk) when the strike is well out of the money", () => {
    const far = call({ strike: 110, bid: 0.35, ask: 0.37, delta: 0.2 });
    const s = { ...stock, price: 99.9, exDividend: "2026-11-05", dividendPerShare: 0.9 };
    const r = evaluateCall(far, s, 95, { ...DEFAULT_PARAMS, minAnnReturn: 0 }, TODAY);
    if (!r.ok) throw new Error(r.reason);
    expect(r.cand.earlyAssignmentRisk).toBe("check");
    const noDiv = evaluateCall(far, { ...s, exDividend: null }, 95, { ...DEFAULT_PARAMS, minAnnReturn: 0 }, TODAY);
    if (!noDiv.ok) throw new Error(noDiv.reason);
    expect(noDiv.cand.earlyAssignmentRisk).toBeNull();
  });
});

describe("account fit", () => {
  it("rich premium -> R, modest -> T, high beta -> T, middle -> R/T", () => {
    expect(accountFit(0.2, 1).flag).toBe("R");
    expect(accountFit(0.07, 1).flag).toBe("T");
    expect(accountFit(0.25, 1.6).flag).toBe("T");
    expect(accountFit(0.12, 1).flag).toBe("R/T");
    expect(accountFit(0.2, null).reasons.length).toBe(1);
  });
});
