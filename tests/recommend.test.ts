import { describe, expect, it } from "vitest";
import { GOALS, assetClassOf, resolveWeights, scoreGoal } from "@/lib/recommend";
import type { ScreenRow } from "@/types/liveScreener";

let n = 0;
function row(over: Partial<ScreenRow>): ScreenRow {
  return {
    ticker: `T${n++}`, name: null, category: null, family: null, leveraged: false, assetClass: "Equity", rateTag: "neutral" as const, rateLabel: "Neutral — mixed", quality: null, qualityScore: null, price: 1, changePct: 0,
    expense: 0.002, yieldTtm: 0.02, aum: 1e10, ytd: 0.1, r1y: 0.1, r3y: 0.1, r5y: 0.1, vol3y: 0.15, dd3y: -0.2, sharpe: 0.5,
    erosion: "None", priceRet3y: 0.05, capFunded: 0, divCagr3y: 0.05, freq: "Quarterly", ...over,
  };
}
const sum = (w: { w: number }[]) => w.reduce((s, x) => s + x.w, 0);

describe("goal weights", () => {
  it("published weights sum to 100%", () => {
    for (const g of Object.values(GOALS)) expect(sum(g.weights)).toBeCloseTo(1, 9);
  });
});

describe("resolveWeights", () => {
  it("normalises custom weights to 100% and ignores zero/negative/NaN", () => {
    const w = resolveWeights("balanced", { sharpe: 2, expense: 1, aum: 0, vol3y: -5, r3y: NaN });
    expect(w.map((x) => x.metric).sort()).toEqual(["expense", "sharpe"]);
    expect(w.find((x) => x.metric === "sharpe")!.w).toBeCloseTo(2 / 3, 9);
    expect(sum(w)).toBeCloseTo(1, 9);
  });
  it("falls back to the goal defaults when custom is empty", () => {
    expect(resolveWeights("income", {})).toBe(GOALS.income.weights);
    expect(resolveWeights("income", null)).toBe(GOALS.income.weights);
  });
  it("keeps metric directions fixed", () => {
    const w = resolveWeights("growth", { dd3y: 1, expense: 1 });
    expect(w.find((x) => x.metric === "dd3y")!.higherIsBetter).toBe(true);
    expect(w.find((x) => x.metric === "expense")!.higherIsBetter).toBe(false);
  });
});

describe("drawdown direction", () => {
  it("a shallower (less negative) drawdown scores higher", () => {
    const rows = [-0.5, -0.4, -0.3, -0.2, -0.1].map((dd3y) => row({ dd3y }));
    const w = resolveWeights("balanced", { dd3y: 1 });
    const s = scoreGoal(rows, "balanced", { weights: w });
    expect(s[0].row.dd3y).toBe(-0.1);
    expect(s[s.length - 1].row.dd3y).toBe(-0.5);
  });
});

describe("peer groups", () => {
  // 6 low-vol bond funds + 6 high-vol equity funds; "lower vol is better" would swamp equities if pooled.
  const bonds = Array.from({ length: 6 }, (_, i) => row({ assetClass: "Fixed income", vol3y: 0.04 + i * 0.002 }));
  const stocks = Array.from({ length: 6 }, (_, i) => row({ assetClass: "Equity", vol3y: 0.16 + i * 0.002 }));
  const w = resolveWeights("defensive", { vol3y: 1 });

  it("pooled ranking puts every bond fund above every equity fund", () => {
    const s = scoreGoal([...bonds, ...stocks], "defensive", { weights: w });
    expect(s.slice(0, 6).every((x) => x.row.assetClass === "Fixed income")).toBe(true);
  });
  it("within-class ranking gives each class its own 0-100 scale", () => {
    const s = scoreGoal([...bonds, ...stocks], "defensive", { weights: w, peerKey: (r) => r.assetClass });
    const best = (c: string) => Math.max(...s.filter((x) => x.row.assetClass === c).map((x) => x.score));
    expect(best("Equity")).toBeCloseTo(best("Fixed income"), 6);
  });
  it("a class with fewer than 5 funds cannot be ranked and is dropped, not guessed", () => {
    const few = [row({ assetClass: "Commodities & crypto" }), row({ assetClass: "Commodities & crypto" })];
    const s = scoreGoal([...bonds, ...few], "defensive", { weights: w, peerKey: (r) => r.assetClass });
    expect(s.some((x) => x.row.assetClass === "Commodities & crypto")).toBe(false);
  });
  it("still requires 70% data coverage", () => {
    const rows = Array.from({ length: 6 }, () => row({ sharpe: null, r3y: null }));
    expect(scoreGoal(rows, "balanced")).toHaveLength(0); // sharpe(35%)+r3y(20%) missing => 45% of weight absent
  });
});

describe("assetClassOf", () => {
  const alloc = (stock: number, bond: number, cash = 0) => ({ stock, bond, cash, other: 0 });
  it("uses reported allocation", () => {
    expect(assetClassOf("Large Blend", alloc(0.99, 0))).toBe("Equity");
    expect(assetClassOf("Intermediate Core Bond", alloc(0, 0.95, 0.05))).toBe("Fixed income");
  });
  it("treats commodity / crypto categories separately regardless of allocation", () => {
    expect(assetClassOf("Commodities Precious Metals", alloc(0, 0))).toBe("Commodities & crypto");
    expect(assetClassOf("Digital Assets", null)).toBe("Commodities & crypto");
  });
  it("falls back to category text, then Other", () => {
    expect(assetClassOf("Long Government", null)).toBe("Fixed income");
    expect(assetClassOf("Technology", null)).toBe("Equity");
    expect(assetClassOf(null, null)).toBe("Other");
  });
});
