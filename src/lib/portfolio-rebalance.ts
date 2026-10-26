/**
 * Sprint B — Drift vs Target + Rebalance Trade List
 */

export type TargetPreset = { label: string; weights: Record<string, number> }; // assetClass -> 0-1
export type AssetWeight = { assetClass: string; weight: number; marketValue: number };

export const PRESETS: TargetPreset[] = [
  { label: "60/40 Balanced", weights: { "Equities / Stocks": 0.6, "Fixed Income / Bonds": 0.4 } },
  { label: "80/20 Growth", weights: { "Equities / Stocks": 0.8, "Fixed Income / Bonds": 0.2 } },
  { label: "40/60 Conservative", weights: { "Equities / Stocks": 0.4, "Fixed Income / Bonds": 0.5, "Cash Equivalents": 0.1 } },
  { label: "100 Equities", weights: { "Equities / Stocks": 1.0 } },
  { label: "All-Weather", weights: { "Equities / Stocks": 0.5, "Fixed Income / Bonds": 0.3, "Commodities & Real Assets": 0.1, "Cash Equivalents": 0.1 } },
];

export type DriftRow = {
  assetClass: string;
  actualWeight: number;
  actualValue: number;
  targetWeight: number;
  driftWeight: number;
  driftValue: number;
  action: "buy" | "sell" | "hold";
};

export function computeDrift(
  actual: AssetWeight[], // sums to 1
  target: Record<string, number>,
  totalMarketValue: number,
): DriftRow[] {
  const actualMap = new Map(actual.map((a) => [a.assetClass, a]));
  const allClasses = new Set([...actual.map((a) => a.assetClass), ...Object.keys(target)]);
  const rows: DriftRow[] = [];
  for (const cls of allClasses) {
    const a = actualMap.get(cls);
    const actualW = a?.weight ?? 0;
    const actualV = a?.marketValue ?? 0;
    const targetW = target[cls] ?? 0;
    const driftW = targetW - actualW;
    const driftV = driftW * totalMarketValue;
    const action: DriftRow["action"] = Math.abs(driftW) < 0.005 ? "hold" : driftW > 0 ? "buy" : "sell";
    rows.push({ assetClass: cls, actualWeight: actualW, actualValue: actualV, targetWeight: targetW, driftWeight: driftW, driftValue: driftV, action });
  }
  return rows.sort((a, b) => Math.abs(b.driftWeight) - Math.abs(a.driftWeight));
}

/**
 * Simple position-level rebalance suggestion:
 * Suggests buy/sell ETFs to move toward target by asset class.
 * Picks largest holding per asset class as the vehicle.
 */
export type RebalanceTrade = {
  ticker: string;
  assetClass: string;
  action: "buy" | "sell";
  amount: number; // $ delta (positive for buy, negative for sell)
  estShares: number | null; // at current price
  price: number | null;
};

export function suggestTrades(
  drift: DriftRow[],
  positions: { ticker: string; assetClass: string; marketValue: number; currentPrice: number | null }[],
  totalValue: number,
): RebalanceTrade[] {
  // Group positions by asset class, sorted by size
  const byClass = new Map<string, typeof positions>();
  for (const p of positions) {
    const arr = byClass.get(p.assetClass) ?? [];
    arr.push(p);
    byClass.set(p.assetClass, arr);
  }
  for (const arr of byClass.values()) arr.sort((a, b) => b.marketValue - a.marketValue);

  const trades: RebalanceTrade[] = [];
  for (const d of drift) {
    if (d.action === "hold" || Math.abs(d.driftValue) < totalValue * 0.005) continue;
    const candidates = byClass.get(d.assetClass) ?? [];
    // For sell: reduce largest holding; for buy: add to largest (or create placeholder if none)
    const vehicle = candidates[0];
    if (vehicle) {
      trades.push({
        ticker: vehicle.ticker,
        assetClass: d.assetClass,
        action: d.action,
        amount: d.driftValue,
        estShares: vehicle.currentPrice ? d.driftValue / vehicle.currentPrice : null,
        price: vehicle.currentPrice,
      });
    } else if (d.action === "buy") {
      trades.push({ ticker: `${d.assetClass} (new)`, assetClass: d.assetClass, action: "buy", amount: d.driftValue, estShares: null, price: null });
    }
  }
  return trades;
}
