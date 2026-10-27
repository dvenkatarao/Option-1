import { describe, expect, it } from "vitest";
import { analystScoreForCoverage, MIN_ANALYST_REC_COVERAGE, OPTIONAL_ANALYST_SCORE_WEIGHT } from "@/lib/analyst-consensus";

describe("optional holdings-weighted analyst score", () => {
  it("uses a valid recommendation only at the documented coverage threshold", () => {
    expect(MIN_ANALYST_REC_COVERAGE).toBe(0.5);
    expect(analystScoreForCoverage({ recMean: 2.1, recCoverageWeight: 0.5 })).toBe(2.1);
    expect(analystScoreForCoverage({ recMean: 2.1, recCoverageWeight: 0.49 })).toBeNull();
  });

  it("rejects absent or out-of-range provider values without imputing them", () => {
    expect(analystScoreForCoverage(null)).toBeNull();
    expect(analystScoreForCoverage({ recMean: null, recCoverageWeight: 0.9 })).toBeNull();
    expect(analystScoreForCoverage({ recMean: 0.8, recCoverageWeight: 0.9 })).toBeNull();
    expect(analystScoreForCoverage({ recMean: 6, recCoverageWeight: 0.9 })).toBeNull();
  });

  it("keeps the optional analyst score at ten percent", () => {
    expect(OPTIONAL_ANALYST_SCORE_WEIGHT).toBe(0.1);
  });
});
