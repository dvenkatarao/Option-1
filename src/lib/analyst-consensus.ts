export const MIN_ANALYST_REC_COVERAGE = 0.5;
export const OPTIONAL_ANALYST_SCORE_WEIGHT = 0.1;

/**
 * Return a Yahoo-scale analyst mean (1=strong buy, 5=sell) only when enough of a fund's
 * provider-reported top-holdings weight has recommendation data. No value is imputed.
 */
export function analystScoreForCoverage(
  consensus: { recMean: number | null; recCoverageWeight: number | null } | null | undefined,
  minCoverage = MIN_ANALYST_REC_COVERAGE,
): number | null {
  const { recMean, recCoverageWeight } = consensus ?? { recMean: null, recCoverageWeight: null };
  if (recCoverageWeight == null || recCoverageWeight < minCoverage) return null;
  if (recMean == null || !Number.isFinite(recMean) || recMean < 1 || recMean > 5) return null;
  return recMean;
}
