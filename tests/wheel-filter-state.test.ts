import { describe, expect, it } from "vitest";
import { parseFilters } from "../src/lib/wheel-filters";
import { DEFAULT_WHEEL_FILTERS, DEFAULT_WHEEL_FILTER_QUERY, serializeWheelFilterState } from "../src/components/live/wheel-filter-state";

describe("shared live wheel filter defaults", () => {
  it("matches the live scanner's A-or-better opportunity criteria", () => {
    const params = Object.fromEntries(new URLSearchParams(DEFAULT_WHEEL_FILTER_QUERY));
    const filters = parseFilters(params);

    expect(filters.minGrade).toBe("A");
    expect(filters.gradeMatch).toBe("minimum");
    expect(filters.sortBy).toBe("score");
    expect(filters.params).toMatchObject({
      deltaMin: 0.15,
      deltaMax: 0.3,
      dteMin: 21,
      dteMax: 50,
      minOi: 100,
      maxSpreadPct: 0.1,
      minAnnReturn: 0.08,
      allowEarnings: false,
    });
  });

  it("serializes dropdown range selections through the existing API parameters", () => {
    const params = new URLSearchParams(serializeWheelFilterState({
      ...DEFAULT_WHEEL_FILTERS,
      dteMin: "14",
      dteMax: "30",
      deltaMin: "0.1",
      deltaMax: "0.2",
    }));
    expect(params.get("dteMin")).toBe("14");
    expect(params.get("dteMax")).toBe("30");
    expect(params.get("dMin")).toBe("0.1");
    expect(params.get("dMax")).toBe("0.2");
  });

  it("serializes the optional live sector and per-contract collateral cap", () => {
    const query = serializeWheelFilterState({
      ...DEFAULT_WHEEL_FILTERS,
      sector: "Technology",
      maxCollateral: "50000",
      maxCollateralEnabled: true,
    });
    const params = new URLSearchParams(query);
    expect(params.get("sector")).toBe("Technology");
    expect(params.get("cashMax")).toBe("50000");

    const withoutCap = serializeWheelFilterState({ ...DEFAULT_WHEEL_FILTERS, maxCollateralEnabled: false });
    expect(new URLSearchParams(withoutCap).has("cashMax")).toBe(false);
  });
});
