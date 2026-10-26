import { describe, expect, it } from "vitest";
import { calculatorHref, wheelCycle } from "../src/lib/wheel-cycle";

describe("wheelCycle", () => {
  it("computes CSP cash, basis and annualised ROC", () => {
    const r = wheelCycle({ spot: 100, putStrike: 95, putCredit: 1.02, putDte: 30, contracts: 1 });
    expect(r).not.toBeNull();
    expect(r!.cashRequired).toBe(9500);
    expect(r!.putPremium).toBeCloseTo(102, 9);
    expect(r!.basisIfAssigned).toBeCloseTo(93.98, 9);
    expect(r!.putRoc).toBeCloseTo(1.02 / (95 - 1.02), 9);
    expect(r!.putAnnRoc).toBeCloseTo((1.02 / (95 - 1.02)) * (365 / 30), 9);
    expect(r!.discountIfAssigned).toBeCloseTo((100 - 93.98) / 100, 9);
    expect(r!.call).toBeUndefined();
  });
  it("adds covered-call phase after assignment", () => {
    const r = wheelCycle({
      spot: 100,
      putStrike: 95,
      putCredit: 1,
      putDte: 30,
      contracts: 2,
      callStrike: 100,
      callCredit: 1.5,
      callDte: 30,
    });
    expect(r!.cashRequired).toBe(19000);
    expect(r!.call?.premium).toBeCloseTo(300, 9);
    expect(r!.call?.ifCalledPerShare).toBeCloseTo(100 - 94 + 1.5, 9);
    expect(r!.call?.ifCalledTotal).toBeCloseTo((100 - 94 + 1.5) * 200, 9);
  });
  it("rejects unusable inputs", () => {
    expect(wheelCycle({ spot: 100, putStrike: 0, putCredit: 1, putDte: 30, contracts: 1 })).toBeNull();
  });
});

describe("calculatorHref", () => {
  it("encodes deep-link params", () => {
    expect(calculatorHref({ ticker: "aapl", preset: "short-put", strike: 180, credit: 1.25 })).toBe(
      "/wheel/calculator?ticker=AAPL&preset=short-put&strike=180&credit=1.25",
    );
  });
});
