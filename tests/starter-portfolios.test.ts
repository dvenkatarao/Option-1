import { describe, expect, it } from "vitest";
import { starterForAnswers, STARTER_PORTFOLIOS } from "@/lib/starter-portfolios";

describe("guided starter portfolio mapping", () => {
  it("prioritizes capital preservation and short time horizons", () => {
    expect(starterForAnswers("growth", "1-3", "grow").id).toBe("conservative");
    expect(starterForAnswers("balanced", "7+", "preserve").id).toBe("conservative");
  });

  it("uses the growth model for a long horizon or growth preference", () => {
    expect(starterForAnswers("balanced", "7+", "modest").id).toBe("growth");
    expect(starterForAnswers("growth", "3-7", "modest").id).toBe("growth");
  });

  it("maps income/defensive to conservative and other moderate goals to balanced", () => {
    expect(starterForAnswers("income", "3-7", "modest").id).toBe("conservative");
    expect(starterForAnswers("defensive", "3-7", "modest")).toMatchObject({ id: "conservative", goal: "defensive" });
    expect(starterForAnswers("lowcost", "3-7", "modest")).toMatchObject({ id: "balanced", goal: "lowcost" });
  });

  it("keeps all template allocations fully invested while remaining editable examples", () => {
    for (const portfolio of STARTER_PORTFOLIOS) {
      expect(portfolio.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 9);
    }
  });
});
