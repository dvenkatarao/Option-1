import { describe, expect, it } from "vitest";
import { filtersQuery, parseFilters } from "../src/lib/wheel-filters";
import { DEFAULT_PARAMS } from "../src/lib/wheel";

describe("parseFilters", () => {
  it("returns the documented defaults for an empty query", () => {
    const f = parseFilters({});
    expect(f.params).toEqual(DEFAULT_PARAMS);
    expect(f.minGrade).toBe("A");
    expect(f.gradeMatch).toBe("minimum");
    expect(f.sortBy).toBe("score");
    expect(f.account).toBe("all");
    expect(f.trendOnly).toBe(false);
    expect(f.params.allowEarnings).toBe(false);
  });
  it("reads checkboxes, grade and account", () => {
    const f = parseFilters({ earn: "1", trend: "1", grade: "A+", acct: "R" });
    expect(f.params.allowEarnings).toBe(true);
    expect(f.trendOnly).toBe(true);
    expect(f.minGrade).toBe("A+");
    expect(f.account).toBe("R");
  });
  it("supports exact grade matching and annualized-return ranking in shareable filters", () => {
    const f = parseFilters({ preset: "B", gradeMatch: "exact", sortBy: "annRoc" });
    expect(f.minGrade).toBe("B");
    expect(f.gradeMatch).toBe("exact");
    expect(f.sortBy).toBe("annRoc");
    const roundTrip = parseFilters(Object.fromEntries(new URLSearchParams(filtersQuery(f))));
    expect(roundTrip.gradeMatch).toBe("exact");
    expect(roundTrip.sortBy).toBe("annRoc");
  });
  it("converts percent inputs to fractions and clamps junk", () => {
    const f = parseFilters({ spread: "5", ret: "12", dMin: "abc", dteMax: "9999", oi: "-4" });
    expect(f.params.maxSpreadPct).toBeCloseTo(0.05);
    expect(f.params.minAnnReturn).toBeCloseTo(0.12);
    expect(f.params.deltaMin).toBe(DEFAULT_PARAMS.deltaMin);
    expect(f.params.dteMax).toBe(120);
    expect(f.params.minOi).toBe(0);
  });
  it("swaps reversed ranges", () => {
    const f = parseFilters({ dteMin: "60", dteMax: "30", dMin: "0.4", dMax: "0.1" });
    expect(f.params.dteMin).toBe(30);
    expect(f.params.dteMax).toBe(60);
    expect(f.params.deltaMin).toBe(0.1);
    expect(f.params.deltaMax).toBe(0.4);
  });
  it("round-trips through filtersQuery", () => {
    const f = parseFilters({ dteMin: "25", dteMax: "40", earn: "1", ret: "10" });
    const sp = Object.fromEntries(new URLSearchParams(filtersQuery(f)));
    const g = parseFilters(sp);
    expect(g.params).toEqual(f.params);
  });
  it("parses and preserves provider-backed sector and collateral filters", () => {
    const f = parseFilters({ cashMax: "25000", sector: " Technology " });
    expect(f.maxCollateral).toBe(25000);
    expect(f.sector).toBe("Technology");

    const roundTrip = parseFilters(Object.fromEntries(new URLSearchParams(filtersQuery(f))));
    expect(roundTrip.maxCollateral).toBe(25000);
    expect(roundTrip.sector).toBe("Technology");

    expect(parseFilters({}).maxCollateral).toBeNull();
    expect(parseFilters({ sector: "all" }).sector).toBeNull();
  });
  it("defaults missing-data policy to exclude and reads keep", () => {
    expect(parseFilters({}).missingPolicy).toBe("exclude");
    expect(parseFilters({ miss: "keep" }).missingPolicy).toBe("keep");
    const q = filtersQuery(parseFilters({ miss: "keep", mode: "custom" }));
    expect(q).toContain("miss=keep");
  });
});
