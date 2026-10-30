import { describe, expect, it } from "vitest";
import { getLiveTickerHydrationCandidate, searchLiveStockProfiles, type LiveStockSearchProfile } from "../src/lib/live-stock-search";

const profiles: LiveStockSearchProfile[] = [
  { ticker: "NOW", name: "ServiceNow, Inc.", sector: "Technology", grade: "B", refreshedAt: "2026-10-29T12:00:00.000Z" },
  { ticker: "CAT", name: "Caterpillar Inc.", sector: "Industrials", grade: "A", refreshedAt: "2026-10-29T12:00:00.000Z" },
  { ticker: "CATS", name: "Cat Systems Inc.", sector: "Technology", grade: "B", refreshedAt: null },
  { ticker: "C", name: "Citigroup Inc.", sector: "Financials", grade: "B", refreshedAt: null },
];

describe("live stock profile search", () => {
  it("matches company names and tickers without case sensitivity", () => {
    expect(searchLiveStockProfiles(profiles, "caterpillar").map((profile) => profile.ticker)).toEqual(["CAT"]);
    expect(searchLiveStockProfiles(profiles, "now").map((profile) => profile.ticker)).toEqual(["NOW"]);
  });

  it("orders exact ticker matches ahead of partial matches", () => {
    expect(searchLiveStockProfiles(profiles, "cat").map((profile) => profile.ticker)).toEqual(["CAT", "CATS"]);
    expect(searchLiveStockProfiles(profiles, "cit").map((profile) => profile.ticker)).toEqual(["C"]);
  });

  it("does not treat sector matches or empty/one-character queries as stock name matches", () => {
    expect(searchLiveStockProfiles(profiles, "technology")).toEqual([]);
    expect(searchLiveStockProfiles(profiles, "c").map((profile) => profile.ticker)).toEqual(["C"]);
    expect(searchLiveStockProfiles(profiles, "n")).toEqual([]);
    expect(searchLiveStockProfiles(profiles, "   ")).toEqual([]);
  });

  it("limits results to the requested count", () => {
    expect(searchLiveStockProfiles(profiles, "cater", 0)).toEqual([]);
    expect(searchLiveStockProfiles(profiles, "i", 10)).toEqual([]);
    expect(searchLiveStockProfiles(profiles, "citigroup", 1)).toHaveLength(1);
  });
});


describe("live ticker hydration lookup", () => {
  it("offers only exact, unhydrated tickers inside the configured universe", () => {
    expect(getLiveTickerHydrationCandidate(" msft ", profiles, ["MSFT", "AAPL"])).toEqual({ ticker: "MSFT", canHydrate: true });
    expect(getLiveTickerHydrationCandidate("CAT", profiles, ["CAT", "MSFT"])).toBeNull();
    expect(getLiveTickerHydrationCandidate("UNKNOWN", profiles, ["MSFT", "AAPL"])).toBeNull();
    expect(getLiveTickerHydrationCandidate("Microsoft Corp", profiles, ["MSFT"])).toBeNull();
  });

  it("supports a single-character configured ticker", () => {
    expect(getLiveTickerHydrationCandidate("V", profiles, ["V"])).toEqual({ ticker: "V", canHydrate: true });
  });
});
