/**
 * Sprint C — IV Rank helper.
 * Stores per-contract IV snapshots and computes percentile rank.
 * Pure percentile function is unit-tested; DB I/O lives in wheel-service.
 */

export function ivPercentile(history: number[], current: number | null): number | null {
  if (current == null || !Number.isFinite(current) || history.length < 20) return null;
  const sorted = [...history].sort((a, b) => a - b);
  let le = 0;
  for (const v of sorted) if (v <= current) le++;
  return Math.round((le / sorted.length) * 100);
}

export function ivRankLabel(pctl: number | null): { label: string; tone: string } {
  if (pctl == null) return { label: "—", tone: "text-slate-400" };
  if (pctl >= 75) return { label: `${pctl}% high`, tone: "text-emerald-400" }; // rich premium
  if (pctl >= 50) return { label: `${pctl}% mid`, tone: "text-amber-300" };
  if (pctl >= 25) return { label: `${pctl}% low`, tone: "text-sky-300" };
  return { label: `${pctl}% very low`, tone: "text-slate-400" };
}

export function ivHistoryKey(ticker: string, expiration: string, strike: number) {
  return `${ticker.toUpperCase()}|${expiration}|${strike}`;
}
