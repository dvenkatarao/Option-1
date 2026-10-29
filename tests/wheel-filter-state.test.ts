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
