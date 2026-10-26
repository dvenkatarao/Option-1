import { describe, expect, it } from "vitest";
import { bsDelta, normCdf } from "../src/lib/bs";

describe("black-scholes", () => {
  it("normal CDF matches reference values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1)).toBeCloseTo(0.1587, 3);
  });
  it("ATM call delta ~0.54 and put delta = call delta - 1", () => {
    const base = { spot: 100, strike: 100, years: 1, iv: 0.2, rate: 0 };
    const c = bsDelta({ ...base, type: "call" })!;
    const p = bsDelta({ ...base, type: "put" })!;
    expect(c).toBeCloseTo(0.5398, 3);
    expect(p).toBeCloseTo(c - 1, 9);
  });
  it("deep OTM put has small negative delta; bad inputs give null", () => {
    const p = bsDelta({ type: "put", spot: 100, strike: 70, years: 30 / 365, iv: 0.25, rate: 0.04 })!;
    expect(p).toBeLessThan(0);
    expect(p).toBeGreaterThan(-0.01);
    expect(bsDelta({ type: "put", spot: 100, strike: 90, years: 0, iv: 0.2, rate: 0.04 })).toBeNull();
    expect(bsDelta({ type: "put", spot: 100, strike: 90, years: 0.1, iv: 0, rate: 0.04 })).toBeNull();
  });
});
