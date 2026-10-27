/**
 * Sprint B — Holdings Overlap
 * Computes pairwise overlap between ETFs in a portfolio using top holdings.
 * Overlap = sum(min(w_i^A, w_i^B)) over common symbols — conservative lower bound
 * because we only have top-10 (not full N-PORT). Flagged as such in UI.
 */

export type HoldingsMap = Map<string, { symbol: string; weight: number }[]>; // ticker -> list of holdings with weight 0-1

export type OverlapCell = {
  a: string;
  b: string;
  overlap: number; // 0-1
  overlapPct: number; // 0-100
  common: { symbol: string; wa: number; wb: number }[];
};

export function overlapBetween(a: { symbol: string; weight: number }[], b: { symbol: string; weight: number }[]): { overlap: number; common: OverlapCell["common"] } {
  const mb = new Map(b.map((h) => [h.symbol.toUpperCase(), h.weight]));
  let overlap = 0;
  const common: OverlapCell["common"] = [];
  for (const ha of a) {
    const sym = ha.symbol.toUpperCase();
    const wb = mb.get(sym);
    if (wb != null && ha.weight != null && wb != null) {
      const w = Math.min(ha.weight, wb);
      overlap += w;
      common.push({ symbol: sym, wa: ha.weight, wb });
    }
  }
  return { overlap, common };
}

export function buildOverlapMatrix(tickers: string[], holdings: HoldingsMap): OverlapCell[] {
  const out: OverlapCell[] = [];
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i; j < tickers.length; j++) {
      const a = tickers[i];
      const b = tickers[j];
      const ha = holdings.get(a) ?? [];
      const hb = holdings.get(b) ?? [];
      const { overlap, common } = overlapBetween(ha, hb);
      // Diagonal = 1
      const ov = i === j ? 1 : overlap;
      out.push({ a, b, overlap: ov, overlapPct: ov * 100, common: i === j ? [] : common });
    }
  }
  return out;
}

export function overlapMatrixForPortfolio(
  positions: { ticker: string }[],
  etfProfiles: Map<string, { symbol: string | null; weight: number | null }[] | null>,
): { tickers: string[]; cells: OverlapCell[] } {
  const uniq = Array.from(new Set(positions.map((p) => p.ticker.toUpperCase()))).slice(0, 12);
  const holdings: HoldingsMap = new Map();
  for (const t of uniq) {
    const prof = etfProfiles.get(t);
    if (!prof) continue;
    const weighted = prof.filter((h): h is { symbol: string; weight: number } =>
      typeof h.symbol === "string" && h.symbol.length > 0 &&
      typeof h.weight === "number" && Number.isFinite(h.weight) && h.weight >= 0,
    );
    holdings.set(t, weighted.map((h) => ({ symbol: h.symbol, weight: h.weight })));
  }
  return { tickers: uniq, cells: buildOverlapMatrix(uniq, holdings) };
}
