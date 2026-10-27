import type { HistoryJson } from "@/db/schema";
import { alignedStats } from "./metrics";
import { overlapBetween } from "./portfolio-overlap";

export const SIMILARITY_THRESHOLDS = {
  returnCorrelation: 0.95,
  top10Overlap: 0.5,
  minimumHistoryDays: 365 * 5,
  minimumPairedReturns: 60,
} as const;

const DAY_SECONDS = 86400;

export type SimilarityHolding = { symbol: string | null; weight: number | null };
export type SimilarityFund = {
  ticker: string;
  name?: string | null;
  assetClass?: string | null;
  holdings?: SimilarityHolding[] | null;
};
export type EtfSimilarityPair = {
  a: string;
  b: string;
  correlation5y: number | null;
  pairedReturnDays: number;
  top10Overlap: number | null;
  commonHoldings: { symbol: string; weightA: number; weightB: number }[];
  evidence: ("return-correlation" | "top-10-holdings")[];
};
export type EtfSimilarityGroup = {
  members: string[];
  pairs: EtfSimilarityPair[];
};
export type EtfSimilarityResult = {
  thresholds: typeof SIMILARITY_THRESHOLDS;
  comparedPairs: number;
  eligibleCorrelationPairs: number;
  holdingsPairs: number;
  groups: EtfSimilarityGroup[];
};

function hasFiveYearCoverage(a: HistoryJson | undefined, b: HistoryJson | undefined): boolean {
  if (!a?.t.length || !b?.t.length) return false;
  const commonEnd = Math.min(a.t[a.t.length - 1], b.t[b.t.length - 1]);
  const start = commonEnd - SIMILARITY_THRESHOLDS.minimumHistoryDays * DAY_SECONDS;
  return a.t[0] <= start && b.t[0] <= start;
}

function weightedHoldings(fund: SimilarityFund) {
  return (fund.holdings ?? []).filter((holding): holding is { symbol: string; weight: number } =>
    typeof holding.symbol === "string" && holding.symbol.trim().length > 0 &&
    typeof holding.weight === "number" && Number.isFinite(holding.weight) && holding.weight > 0,
  ).map((holding) => ({ symbol: holding.symbol.trim().toUpperCase(), weight: holding.weight }));
}

/**
 * Groups funds when a direct pair meets either documented evidence threshold:
 * 5Y adjusted-return correlation >= 0.95, or >= 50% overlap among provider-reported top holdings.
 * Components are transitively connected; each direct link and metric is retained for inspection.
 */
export function buildEtfSimilarityGroups(
  funds: SimilarityFund[],
  histories: Record<string, HistoryJson | undefined>,
): EtfSimilarityResult {
  const byTicker = new Map(funds.map((fund) => [fund.ticker.toUpperCase(), fund]));
  const unique = [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const pairs: EtfSimilarityPair[] = [];
  let comparedPairs = 0;
  let eligibleCorrelationPairs = 0;
  let holdingsPairs = 0;

  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i];
      const b = unique[j];
      comparedPairs++;
      const historyA = histories[a.ticker.toUpperCase()];
      const historyB = histories[b.ticker.toUpperCase()];
      let correlation5y: number | null = null;
      let pairedReturnDays = 0;
      if (hasFiveYearCoverage(historyA, historyB)) {
        const stats = alignedStats(historyA!, historyB!, 5);
        pairedReturnDays = stats.n;
        if (stats.n >= SIMILARITY_THRESHOLDS.minimumPairedReturns && Number.isFinite(stats.corr)) {
          correlation5y = stats.corr;
          eligibleCorrelationPairs++;
        }
      }

      const holdingsA = weightedHoldings(a);
      const holdingsB = weightedHoldings(b);
      let top10Overlap: number | null = null;
      let commonHoldings: EtfSimilarityPair["commonHoldings"] = [];
      // With fewer than five weighted holdings on either side, a low overlap would be misleading.
      if (holdingsA.length >= 5 && holdingsB.length >= 5) {
        const overlap = overlapBetween(holdingsA, holdingsB);
        top10Overlap = overlap.overlap;
        commonHoldings = overlap.common
          .map((holding) => ({ symbol: holding.symbol, weightA: holding.wa, weightB: holding.wb }))
          .sort((x, y) => Math.min(y.weightA, y.weightB) - Math.min(x.weightA, x.weightB));
        holdingsPairs++;
      }

      const evidence: EtfSimilarityPair["evidence"] = [];
      if (correlation5y != null && correlation5y >= SIMILARITY_THRESHOLDS.returnCorrelation) evidence.push("return-correlation");
      if (top10Overlap != null && top10Overlap >= SIMILARITY_THRESHOLDS.top10Overlap) evidence.push("top-10-holdings");
      if (evidence.length) pairs.push({ a: a.ticker, b: b.ticker, correlation5y, pairedReturnDays, top10Overlap, commonHoldings, evidence });
    }
  }

  // Union-find forms groups from strong direct links; the UI also displays each link to avoid hiding transitivity.
  const parent = new Map<string, string>();
  const find = (ticker: string): string => {
    const p = parent.get(ticker) ?? ticker;
    if (p === ticker) {
      parent.set(ticker, ticker);
      return ticker;
    }
    const root = find(p);
    parent.set(ticker, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const pair of pairs) union(pair.a, pair.b);

  const components = new Map<string, Set<string>>();
  for (const pair of pairs) {
    const root = find(pair.a);
    const members = components.get(root) ?? new Set<string>();
    members.add(pair.a);
    members.add(pair.b);
    components.set(root, members);
  }
  const groups = [...components.entries()]
    .map(([root, members]) => ({
      root,
      members: [...members].sort(),
      pairs: pairs.filter((pair) => find(pair.a) === root),
    }))
    .map(({ members, pairs: groupPairs }) => ({ members, pairs: groupPairs }))
    .sort((a, b) => b.members.length - a.members.length || a.members[0].localeCompare(b.members[0]));

  return { thresholds: SIMILARITY_THRESHOLDS, comparedPairs, eligibleCorrelationPairs, holdingsPairs, groups };
}
