import { describe, expect, it } from "vitest";
import { addModelDeltas, hasUsableQuotes, parseAlpaca, parseOcc, parseYahooResult, runProviders } from "../src/lib/options-parse";
import type { OptionContract } from "../src/lib/wheel";

describe("parseOcc", () => {
  it("decodes OCC symbols and rejects junk", () => {
    expect(parseOcc("AAPL251121P00207500")).toEqual({ underlying: "AAPL", expiration: "2025-11-21", type: "put", strike: 207.5 });
    expect(parseOcc("BRK.B261218C00500000")?.type).toBe("call");
    expect(parseOcc("nonsense")).toBeNull();
  });
});

describe("parseAlpaca", () => {
  const snaps = {
    AAPL261120P00200000: { latestQuote: { bp: 2.1, ap: 2.2 }, latestTrade: { p: 2.15 }, greeks: { delta: -0.21 }, impliedVolatility: 0.27, dailyBar: { v: 120 } },
    AAPL261120P00190000: { latestQuote: { bp: 0.9, ap: 1.0 }, impliedVolatility: 0.29 }, // no greeks
  };
  const contracts = [
    { symbol: "AAPL261120P00200000", expiration_date: "2026-11-20", strike_price: "200", type: "put", open_interest: "1500" },
    { symbol: "AAPL261120P00190000", expiration_date: "2026-11-20", strike_price: "190", type: "put", open_interest: "400" },
    { symbol: "AAPL261120P00180000", expiration_date: "2026-11-20", strike_price: "180", type: "put", open_interest: "10" }, // no snapshot -> dropped
  ];
  it("joins snapshots and contracts, keeps provider deltas, drops unmatched", () => {
    const r = parseAlpaca(snaps, contracts);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ strike: 200, bid: 2.1, ask: 2.2, delta: -0.21, deltaSource: "provider", iv: 0.27, oi: 1500, volume: 120, source: "alpaca", type: "put" });
    expect(r[1].delta).toBeNull();
    expect(r[1].oi).toBe(400);
  });
});

describe("parseYahooResult", () => {
  const json = {
    optionChain: {
      result: [
        {
          expirationDates: [1795132800, 1797638400],
          quote: { regularMarketPrice: 210 },
          options: [
            {
              puts: [
                { contractSymbol: "AAPL261120P00200000", strike: 200, expiration: 1795132800, bid: 2.1, ask: 2.2, lastPrice: 2.15, volume: 10, openInterest: 900, impliedVolatility: 0.28 },
                { contractSymbol: "AAPL261120P00100000", strike: 100, expiration: 1795132800, bid: 0, ask: 0.01, impliedVolatility: 0.00001 },
              ],
              calls: [],
            },
          ],
        },
      ],
    },
  };
  it("parses puts, derives the expiration date and nulls unusable IV", () => {
    const r = parseYahooResult(json, "put");
    expect(r.expirations).toHaveLength(2);
    expect(r.price).toBe(210);
    expect(r.contracts[0]).toMatchObject({ strike: 200, expiration: "2026-11-20", oi: 900, iv: 0.28, delta: null, source: "yahoo" });
    expect(r.contracts[1].iv).toBeNull();
  });
  it("throws on an empty response", () => {
    expect(() => parseYahooResult({}, "put")).toThrow(/empty/);
  });
});

describe("addModelDeltas", () => {
  const base: OptionContract = { symbol: "X", type: "put", strike: 190, expiration: "2026-11-20", bid: 1, ask: 1.1, last: 1, delta: null, deltaSource: null, iv: 0.28, oi: 500, volume: 1, source: "yahoo" };
  it("models delta where missing, never overwrites provider deltas, skips contracts without IV", () => {
    const out = addModelDeltas([base, { ...base, delta: -0.3, deltaSource: "provider" }, { ...base, iv: null }], 210, 0.04, "2026-10-21");
    expect(out[0].deltaSource).toBe("model");
    expect(out[0].delta!).toBeLessThan(0);
    expect(out[0].delta!).toBeGreaterThan(-0.3);
    expect(out[1].delta).toBe(-0.3);
    expect(out[2].delta).toBeNull();
  });
});

describe("failover", () => {
  const good: OptionContract = { symbol: "X", type: "put", strike: 190, expiration: "2026-11-20", bid: 1, ask: 1.1, last: 1, delta: -0.2, deltaSource: "provider", iv: 0.28, oi: 500, volume: 1, source: "yahoo" };
  it("uses the primary when it works", async () => {
    const r = await runProviders([{ name: "alpaca", fn: async () => [{ ...good, source: "alpaca" }] }, { name: "yahoo", fn: async () => [good] }]);
    expect(r.source).toBe("alpaca");
    expect(r.fallbackReason).toBeNull();
  });
  it("falls back to Yahoo and records why when Alpaca throws, is empty, or has no quotes", async () => {
    for (const bad of [async () => { throw new Error("HTTP 403"); }, async () => [], async () => [{ ...good, bid: null, ask: null }]]) {
      const r = await runProviders([{ name: "alpaca", fn: bad as () => Promise<OptionContract[]> }, { name: "yahoo", fn: async () => [good] }]);
      expect(r.source).toBe("yahoo");
      expect(r.fallbackReason).toMatch(/^alpaca:/);
    }
  });
  it("throws a combined error when every provider fails", async () => {
    await expect(runProviders([{ name: "alpaca", fn: async () => { throw new Error("a"); } }, { name: "yahoo", fn: async () => { throw new Error("b"); } }])).rejects.toThrow(/alpaca: a \| yahoo: b/);
    await expect(runProviders([])).rejects.toThrow(/no option-chain provider/);
  });
  it("hasUsableQuotes needs a two-sided quote", () => {
    expect(hasUsableQuotes([good])).toBe(true);
    expect(hasUsableQuotes([{ ...good, bid: null }])).toBe(false);
  });
});
