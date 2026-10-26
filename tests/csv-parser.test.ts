import { describe, expect, it } from "vitest";
import { parseBrokerPositionsCsv } from "@/lib/brokers/csv-parser";
import { SUPPORTED_BROKERS } from "@/lib/brokers/types";

describe("parseBrokerPositionsCsv", () => {
  it("parses every bundled sample CSV", () => {
    for (const meta of Object.values(SUPPORTED_BROKERS)) {
      const r = parseBrokerPositionsCsv(meta.sampleCsv, meta.id);
      expect(r.success, meta.id).toBe(true);
      expect(r.positions.length).toBeGreaterThan(0);
    }
  });
  it("derives per-share cost from total cost basis", () => {
    const r = parseBrokerPositionsCsv("Symbol,Quantity,Cost Basis\nVOO,10,\"$5,000.00\"", "schwab");
    expect(r.positions[0]).toMatchObject({ ticker: "VOO", quantity: 10, averageCostBasis: 500 });
  });
  it("never invents a cost basis: rows with no cost or price are skipped and reported", () => {
    const r = parseBrokerPositionsCsv("Symbol,Quantity\nVOO,10\nSPY,5", "manual");
    expect(r.success).toBe(false);
    expect(r.errors.join(" ")).toMatch(/no cost basis/);
  });
  it("warns when the statement price is used in place of cost basis", () => {
    const r = parseBrokerPositionsCsv("Symbol,Shares,Share Price\nVOO,10,500", "vanguard");
    expect(r.success).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/no cost basis/);
  });
  it("rejects invalid tickers and non-positive quantities", () => {
    const r = parseBrokerPositionsCsv("Symbol,Quantity,Avg Cost\n<script>,1,1\nVOO,-3,1\nSPY,2,3", "manual");
    expect(r.positions.map((p) => p.ticker)).toEqual(["SPY"]);
  });
  it("rejects oversized input", () => {
    expect(parseBrokerPositionsCsv("x".repeat(1_000_001)).success).toBe(false);
  });
});
