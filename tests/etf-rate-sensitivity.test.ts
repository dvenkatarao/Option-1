import { describe, expect, it } from "vitest";
import { rateTagForEtf } from "../src/lib/etf-rate-sensitivity";

describe("rateTagForEtf", () => {
  it("tags cash-like and long bonds correctly", () => {
    expect(rateTagForEtf({ ticker: "BIL", category: null, assetClass: "Cash-like" }).tag).toBe("defensive");
    expect(rateTagForEtf({ ticker: "TLT", category: "Long Government", assetClass: "Fixed income" }).tag).toBe("sensitive");
  });
  it("uses category patterns when ticker not in override", () => {
    expect(rateTagForEtf({ ticker: "XYZ", category: "Short-Term Bond", assetClass: "Fixed income" }).tag).toBe("defensive");
    expect(rateTagForEtf({ ticker: "ABC", category: "Technology", assetClass: "Equity" }).tag).toBe("sensitive");
  });
  it("fallbacks to neutral", () => {
    expect(rateTagForEtf({ ticker: "VOO", category: "Large Blend", assetClass: "Equity" }).tag).toBe("neutral");
  });
});
