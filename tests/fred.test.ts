import { describe, expect, it } from "vitest";
import { parseFredCsv } from "../src/lib/fred-csv";

describe("parseFredCsv", () => {
  it("parses a valid CSV and skips missing values", () => {
    const r = parseFredCsv("observation_date,DGS10\n2026-10-01,4.1\n2026-10-02,.\n2026-10-03,4.2\n", "DGS10");
    expect(r).toEqual([{ date: "2026-10-01", value: 4.1 }, { date: "2026-10-03", value: 4.2 }]);
  });
  it("accepts the legacy DATE header", () => {
    expect(parseFredCsv("DATE,DFF\n2026-10-01,4.1", "DFF")).toHaveLength(1);
  });
  it("rejects error pages and stubs", () => {
    expect(() => parseFredCsv("<html><body>Blocked</body></html>", "DGS10")).toThrow(/not a FRED CSV/);
    expect(() => parseFredCsv("300,400", "DGS10")).toThrow();
  });
  it("rejects a header for a different series", () => {
    expect(() => parseFredCsv("observation_date,DGS2\n2026-10-01,4", "DGS10")).toThrow();
  });
  it("rejects invalid dates", () => {
    expect(() => parseFredCsv("observation_date,DGS10\n300,400", "DGS10")).toThrow(/Invalid date/);
  });
});
