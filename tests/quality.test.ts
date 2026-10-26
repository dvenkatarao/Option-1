import { describe, expect, it } from "vitest";
import type { EtfRow } from "@/lib/etf-service";
import { gradeFor, isLowGrade, worseGrade } from "@/lib/grades";
import { AGE_BANDS, AUM_BANDS, COST_BANDS, DOLLAR_VOLUME_BANDS, SPREAD_BANDS, TOP10_BANDS, ageYears, computeQuality, interp, qualityInputFromRow, type QualityInput } from "@/lib/quality";

const NOW = new Date("2026-10-20T12:00:00Z");
const base: QualityInput = {
  assetClass: "Equity", category: "Large Blend", name: "Big Index ETF", leveraged: false,
  expense: 0.0003, aum: 5e11, inceptionDate: "2010-09-07", firstBar: null,
  avgDollarVolume: 3e9, spreadMedianRel: null, top10Weight: 0.33, yieldTtm: 0.012, erosionLevel: "None", now: NOW,
};
const q = (o: Partial<QualityInput> = {}) => computeQuality({ ...base, ...o });
const pillar = (r: ReturnType<typeof q>, k: string) => r.pillars.find((p) => p.key === k)!;

describe("grades", () => {
  it("maps score boundaries", () => {
    expect([100, 85, 84.99, 70, 69.99, 55, 54.99, 40, 39.99, 0].map(gradeFor)).toEqual(["A", "A", "B", "B", "C", "C", "D", "D", "F", "F"]);
  });
  it("worseGrade picks the lower grade", () => {
    expect(worseGrade("A", "C")).toBe("C");
    expect(worseGrade("F", "C")).toBe("F");
    expect(isLowGrade("D") && isLowGrade("F") && !isLowGrade("C") && !isLowGrade(null)).toBe(true);
  });
});

describe("bands", () => {
  const monotone = (pts: [number, number][], dir: 1 | -1) => pts.every((p, i) => i === 0 || (p[0] > pts[i - 1][0] && (p[1] - pts[i - 1][1]) * dir >= 0));
  it("rising bands rise, falling bands fall", () => {
    expect(monotone(AUM_BANDS, 1) && monotone(AGE_BANDS, 1) && monotone(DOLLAR_VOLUME_BANDS, 1)).toBe(true);
    expect(monotone(SPREAD_BANDS, -1) && monotone(TOP10_BANDS, -1)).toBe(true);
    for (const b of Object.values(COST_BANDS)) expect(monotone(b, -1)).toBe(true);
  });
  it("interp clamps and interpolates", () => {
    expect(interp([[0, 0], [10, 100]], -5)).toBe(0);
    expect(interp([[0, 0], [10, 100]], 5)).toBe(50);
    expect(interp([[0, 0], [10, 100]], 99)).toBe(100);
  });
  it("equity cost bands match the published spec", () => {
    expect(interp(COST_BANDS.Equity, 0.001)).toBe(100);
    expect(interp(COST_BANDS.Equity, 0.004)).toBe(65);
    expect(interp(COST_BANDS.Equity, 0.01)).toBe(0);
    expect(interp(COST_BANDS.Equity, 0.02)).toBe(0);
  });
});

describe("computeQuality", () => {
  it("a huge, cheap, liquid, diversified, old index fund earns an A", () => {
    const r = q();
    expect(r.grade).toBe("A");
    expect(r.score!).toBeGreaterThanOrEqual(85);
    expect(r.coverage).toBeCloseTo(0.85, 9); // income pillar not applicable for a 1.2% yielder
    expect(pillar(r, "income").status).toBe("not applicable");
    expect(r.strengths).toContain("cost");
  });
  it("an expensive, tiny, young, thin fund fails and is capped", () => {
    const r = q({ expense: 0.0085, aum: 4e7, inceptionDate: "2026-02-01", avgDollarVolume: 2e5, top10Weight: 0.8 });
    expect(r.grade).toBe("F");
    expect(r.caps.length).toBe(2); // small + young
    expect(r.weaknesses).toContain("cost");
  });
  it("leveraged funds are capped at C even when the raw score is an A", () => {
    const r = q({ leveraged: true, expense: 0.0005 });
    expect(r.rawGrade).toBe("A");
    expect(r.grade).toBe("C");
    expect(r.caps[0]).toMatch(/not suited to buy-and-hold/);
  });
  it("a small fund is capped at C", () => {
    const r = q({ aum: 9e7 });
    expect(r.caps.join(" ")).toMatch(/closed/);
    expect(["C", "D", "F"]).toContain(r.grade);
  });
  it("a young fund is capped at C", () => {
    const r = q({ inceptionDate: "2025-06-01" });
    expect(["C", "D", "F"]).toContain(r.grade);
    expect(r.caps.join(" ")).toMatch(/years old/);
  });
  it("issues no grade when under 70% of the weight has data", () => {
    const r = q({ aum: null, avgDollarVolume: null, top10Weight: null });
    expect(r.grade).toBeNull();
    expect(r.score).toBeNull();
    expect(r.coverage).toBeLessThan(0.7);
    expect(r.summary).toMatch(/Not enough data/);
  });
  it("grades at exactly 70% coverage (non-payer, no holdings)", () => {
    const r = q({ top10Weight: null });
    expect(r.coverage).toBeCloseTo(0.7, 9);
    expect(r.grade).not.toBeNull();
  });
  it("renormalises over available pillars instead of treating gaps as zeros", () => {
    const full = q();
    const noHoldings = q({ top10Weight: null });
    expect(noHoldings.score!).toBeGreaterThan(full.score! - 10);
  });
  it("age falls back to the first price bar when inception is missing", () => {
    expect(ageYears(null, "2020-10-20", NOW)).toBeCloseTo(6, 1);
    expect(ageYears(null, null, NOW)).toBeNull();
    expect(ageYears("not-a-date", "2020-10-20", NOW)).toBeCloseTo(6, 1);
    expect(ageYears("2030-01-01", null, NOW)).toBe(0);
  });
  it("scale needs both assets and age", () => {
    expect(pillar(q({ aum: null }), "scale").status).toBe("no data");
    expect(pillar(q({ inceptionDate: null, firstBar: null }), "scale").status).toBe("no data");
  });
  it("uses the real spread once available and says when it is not measured", () => {
    const without = pillar(q(), "liquidity");
    expect(without.detail).toMatch(/not measured yet/);
    const tight = pillar(q({ spreadMedianRel: 0.0001 }), "liquidity");
    const wide = pillar(q({ spreadMedianRel: 0.005 }), "liquidity");
    expect(tight.score!).toBeGreaterThan(wide.score!);
    expect(tight.detail).toMatch(/typical gap/);
  });
  it("ignores impossible top-10 weights", () => {
    expect(pillar(q({ top10Weight: 7.2 }), "diversification").status).toBe("no data");
    expect(pillar(q({ top10Weight: 0 }), "diversification").status).toBe("no data");
  });
  it("income integrity: high-yield equity funds are judged on NAV erosion", () => {
    const sev = q({ yieldTtm: 0.09, erosionLevel: "Severe", category: "Derivative Income" });
    expect(pillar(sev, "income").score).toBe(0);
    expect(pillar(sev, "income").detail).toMatch(/own capital/);
    expect(pillar(q({ yieldTtm: 0.09, erosionLevel: "None" }), "income").score).toBe(100);
  });
  it("income integrity is skipped for bond funds and for erosion that cannot be computed", () => {
    expect(pillar(q({ assetClass: "Fixed income", yieldTtm: 0.05, erosionLevel: "Severe" }), "income").status).toBe("not applicable");
    expect(pillar(q({ yieldTtm: 0.09, erosionLevel: "n/a" }), "income").status).toBe("no data");
  });
  it("adds plain-English notes for option-income, commodity/crypto and concentrated funds", () => {
    expect(q({ name: "Global X NASDAQ 100 Covered Call ETF" }).notes.join(" ")).toMatch(/options/);
    expect(q({ category: "Derivative Income", name: "Something" }).notes.join(" ")).toMatch(/options/);
    expect(q({ assetClass: "Commodities & crypto" }).notes.join(" ")).toMatch(/K-1/);
    expect(q({ top10Weight: 0.7 }).notes.join(" ")).toMatch(/Concentrated/);
    expect(q().notes).toEqual([]);
  });
  it("fixed bands make cost class-aware", () => {
    const eq = pillar(q({ assetClass: "Equity", expense: 0.0025 }), "cost").score!;
    const bond = pillar(q({ assetClass: "Fixed income", expense: 0.0025 }), "cost").score!;
    expect(bond).toBeGreaterThan(75); // 0.25% is fine for a bond fund...
    expect(eq).toBeGreaterThan(75); // ...and roughly fine for equity
    expect(pillar(q({ assetClass: "Cash-like", expense: 0.006 }), "cost").score).toBe(0);
  });
});

describe("qualityInputFromRow", () => {
  const row = (o: Partial<EtfRow> = {}) =>
    ({
      ticker: "TEST", name: "Test ETF", category: "Large Blend", expenseRatio: 0.0005, totalAssets: 2e10, inceptionDate: "2012-01-01",
      lastClose: 100,
      profile: { holdings: Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, name: `S${i}`, weight: 0.03 })), sectors: [], allocation: { stock: 0.99, bond: 0, cash: 0, other: 0 }, reported: { ytdReturn: null, threeYearAvgReturn: null, fiveYearAvgReturn: null } },
      metrics: { firstBar: "2015-01-01", dividends: { ttmYield: 0.015 }, erosion: { level: "None" } },
      ...o,
    }) as unknown as EtfRow;
  it("derives dollar volume, concentration and class", () => {
    const i = qualityInputFromRow(row(), { symbol: "TEST", price: 50, avgVolume3m: 2_000_000 } as never, null, NOW);
    expect(i.avgDollarVolume).toBe(100_000_000);
    expect(i.top10Weight).toBeCloseTo(0.3, 9);
    expect(i.assetClass).toBe("Equity");
    expect(i.spreadMedianRel).toBeNull();
  });
  it("needs at least five known holding weights and a live volume", () => {
    const sparse = row({ profile: { holdings: [{ symbol: "A", name: "A", weight: 0.5 }], sectors: [], allocation: { stock: 1, bond: 0, cash: 0, other: 0 }, reported: { ytdReturn: null, threeYearAvgReturn: null, fiveYearAvgReturn: null } } } as never);
    const i = qualityInputFromRow(sparse, undefined, null, NOW);
    expect(i.top10Weight).toBeNull();
    expect(i.avgDollarVolume).toBeNull();
  });
  it("only uses spread history when there are enough samples", () => {
    expect(qualityInputFromRow(row(), null, { median: 0.0002, n: 5, days: 1 }, NOW).spreadMedianRel).toBeNull();
    expect(qualityInputFromRow(row(), null, { median: 0.0002, n: 40, days: 8 }, NOW).spreadMedianRel).toBe(0.0002);
  });
  it("flags leveraged funds from the name", () => {
    expect(qualityInputFromRow(row({ name: "ProShares UltraPro QQQ 3x" }), null, null, NOW).leveraged).toBe(true);
  });
});
