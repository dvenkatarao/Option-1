import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";
import { classifyMassiveInstrument, fetchMassiveEtfUniverse, normalizeMassiveEtfs } from "@/lib/etf-universe-discovery";

const providerEtf = (ticker: string, extra: Record<string, unknown> = {}) => ({
  ticker,
  name: `${ticker} ETF`,
  market: "stocks",
  locale: "us",
  type: "ETF",
  active: true,
  primary_exchange: "ARCX",
  cik: "0000000001",
  last_updated_utc: "2026-10-27T00:00:00Z",
  ...extra,
});

describe("Massive ETF universe discovery", () => {
  it("only accepts explicit active U.S. stock ETFs and normalizes/deduplicates tickers", () => {
    const tickers = normalizeMassiveEtfs([
      providerEtf(" spy "),
      providerEtf("Voo"),
      providerEtf("SPY", { name: "Updated SPY ETF" }),
      providerEtf("ETN1", { type: "ETN" }),
      providerEtf("MF1", { type: "FUND" }),
      providerEtf("INACTIVE", { active: false }),
      providerEtf("FOREIGN", { locale: "ca" }),
      providerEtf("ADR", { market: "otc" }),
      providerEtf("BAD/TICKER"),
    ]);

    expect(tickers.map((item) => item.ticker)).toEqual(["SPY", "VOO"]);
    expect(tickers[0].name).toBe("Updated SPY ETF");
    expect(classifyMassiveInstrument(providerEtf("NOTE1", { type: "ETN" }))).toBe("ETN");
    expect(classifyMassiveInstrument(providerEtf("FUND1", { type: "FUND" }))).toBe("other");
  });

  it("paginates only on Massive hosts, applies provider filters, and publishes a complete compact snapshot", async () => {
    const urls: URL[] = [];
    const waits: number[] = [];
    const snapshot = await fetchMassiveEtfUniverse("server-secret", {
      pageIntervalMs: 12_500,
      wait: async (ms) => { waits.push(ms); },
      fetchPage: async (url) => {
        urls.push(url);
        if (urls.length === 1) {
          return {
            status: "OK",
            results: [providerEtf("VOO"), providerEtf("ETN1", { type: "ETN" })],
            next_url: "https://api.massive.com/v3/reference/tickers?cursor=next-page",
          };
        }
        return { status: "OK", results: [providerEtf("SPY")] };
      },
    });

    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.get("market")).toBe("stocks");
    expect(urls[0].searchParams.get("locale")).toBe("us");
    expect(urls[0].searchParams.get("type")).toBe("ETF");
    expect(urls[0].searchParams.get("active")).toBe("true");
    expect(urls[0].searchParams.get("limit")).toBe("1000");
    expect(urls[0].searchParams.get("apiKey")).toBe("server-secret");
    expect(urls[1].hostname).toBe("api.massive.com");
    expect(urls[1].searchParams.get("apiKey")).toBe("server-secret");
    expect(waits).toEqual([12_500]);
    expect(snapshot).toMatchObject({ provider: "Polygon/Massive", pageCount: 2 });
    expect(snapshot.tickers.map((item) => item.ticker)).toEqual(["SPY", "VOO"]);
    expect(JSON.stringify(snapshot)).not.toContain("server-secret");
  });

  it("does not save a partial listing when pagination exceeds the safety cap", async () => {
    await expect(fetchMassiveEtfUniverse("key", {
      maxPages: 1,
      wait: async () => {},
      fetchPage: async () => ({
        status: "OK",
        results: [providerEtf("SPY")],
        next_url: "https://api.polygon.io/v3/reference/tickers?cursor=another-page",
      }),
    })).rejects.toThrow(/safety limit/);
  });

  it("waits before retrying one rate-limited provider page", async () => {
    const fetchPage = vi.fn()
      .mockRejectedValueOnce(new HttpError("HTTP 429", 429))
      .mockResolvedValueOnce({ status: "OK", results: [providerEtf("SPY")] });
    const waits: number[] = [];
    const result = await fetchMassiveEtfUniverse("key", {
      wait: async (ms) => { waits.push(ms); },
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([60_000]);
    expect(result.tickers.map((item) => item.ticker)).toEqual(["SPY"]);
  });

  it("rejects pagination URLs outside the provider allowlist", async () => {
    await expect(fetchMassiveEtfUniverse("key", {
      wait: async () => {},
      fetchPage: async () => ({
        status: "OK",
        results: [providerEtf("SPY")],
        next_url: "https://attacker.invalid/steal?cursor=secret",
      }),
    })).rejects.toThrow(/unexpected pagination host/);
  });
});
