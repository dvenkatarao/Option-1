/**
 * Sprint C — Capital & assignment helpers (pure, testable).
 */

export type CapitalPlan = {
  cashPerContract: number; // strike * 100
  totalNeeded: number;
  count: number;
  contractsPerName: number;
  availableCash: number;
  coverage: number | null; // how many assignments you can fund
  overAllocated: boolean;
  reserveRemaining: number | null;
};

export function planCapital(candidates: { contract: { strike: number } }[], availableCash: number, contractsPerName = 1): CapitalPlan {
  const count = candidates.length;
  const cashPerContract = candidates[0]?.contract.strike ? candidates[0].contract.strike * 100 * contractsPerName : 0;
  // Sum across distinct names (not all candidates, but best per ticker)
  const totalNeeded = candidates.reduce((s, r) => s + r.contract.strike * 100 * contractsPerName, 0);
  const coverage = availableCash > 0 && cashPerContract > 0 ? Math.floor(availableCash / cashPerContract) : null;
  const overAllocated = availableCash > 0 && totalNeeded > availableCash;
  const reserveRemaining = availableCash != null ? availableCash - totalNeeded : null;
  return { cashPerContract, totalNeeded, count, contractsPerName, availableCash, coverage, overAllocated, reserveRemaining };
}

export type AssignmentLoss = {
  breakeven: number;
  currentPrice: number;
  lossIfAssigned: number; // (breakeven - current)/current? Actually paper loss after assignment if you hold at breakeven vs current
  lossPct: number; // (current - breakeven)/breakeven? Common: how far breakeven is above current
  isLoss: boolean;
  vsTargetPct: number | null;
};

export function assignmentLoss(put: { breakeven: number; contract: { strike: number }; credit: number }, currentPrice: number, targetMean: number | null | undefined): AssignmentLoss {
  const breakeven = put.breakeven;
  // If assigned you own 100 shares at breakeven; current unrealized vs breakeven
  const lossIfAssigned = currentPrice - breakeven;
  const lossPct = breakeven ? (currentPrice - breakeven) / breakeven : 0;
  const vsTargetPct = targetMean ? (breakeven - targetMean) / targetMean : null;
  return {
    breakeven,
    currentPrice,
    lossIfAssigned,
    lossPct,
    isLoss: lossIfAssigned < 0,
    vsTargetPct,
  };
}

export function sectorConcentration(stats: { sector: string | null | undefined }[]) {
  const counts = new Map<string, number>();
  for (const s of stats) {
    const k = (s.sector ?? "Unknown") || "Unknown";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = stats.length || 1;
  const breakdown = [...counts.entries()].map(([sector, n]) => ({ sector, count: n, pct: n / total })).sort((a, b) => b.count - a.count);
  const max = breakdown[0];
  const warn = max && max.pct >= 0.3 && breakdown.length > 1;
  return { breakdown, max, warn, total };
}
