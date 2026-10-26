/**
 * Full wheel cycle math: cash-secured put → (optional) assignment → covered call.
 * Per-share credits; cash figures use the 100-share multiplier.
 */

export type WheelCycleInput = {
  spot: number;
  putStrike: number;
  putCredit: number;
  putDte: number;
  contracts: number;
  callStrike?: number | null;
  callCredit?: number | null;
  callDte?: number | null;
};

export type WheelCycle = {
  contracts: number;
  cashRequired: number;
  putPremium: number;
  basisIfAssigned: number;
  discountIfAssigned: number | null;
  putRoc: number;
  putAnnRoc: number;
  breakeven: number;
  otmPnl: number;
  call?: {
    premium: number;
    ifCalledPerShare: number;
    ifCalledTotal: number;
    ifCallExpiresPerShare: number;
    cycleAnnIfCalled: number | null;
  };
};

export function wheelCycle(input: WheelCycleInput): WheelCycle | null {
  const { spot, putStrike, putCredit, putDte, contracts } = input;
  if (!(putStrike > 0) || !(putCredit >= 0) || !(putDte > 0) || !(contracts > 0)) return null;
  const n = Math.max(1, Math.floor(contracts));
  const cashRequired = putStrike * 100 * n;
  const putPremium = putCredit * 100 * n;
  const basisIfAssigned = putStrike - putCredit;
  // Same as the screener / payoff: return on cash at risk (strike − credit), not on strike.
  const putRoc = basisIfAssigned > 0 ? putCredit / basisIfAssigned : 0;
  const putAnnRoc = (putRoc * 365) / putDte;
  const callStrike = input.callStrike;
  const callCredit = input.callCredit;
  const callDte = input.callDte;
  let call: WheelCycle["call"];
  if (callStrike != null && callStrike > 0 && callCredit != null && callCredit >= 0 && callDte != null && callDte > 0) {
    const ifCalledPerShare = callStrike - basisIfAssigned + callCredit;
    const totalDays = putDte + callDte;
    const cycleAnnIfCalled = basisIfAssigned > 0 && totalDays > 0 ? (ifCalledPerShare / basisIfAssigned) * (365 / totalDays) : null;
    call = {
      premium: callCredit * 100 * n,
      ifCalledPerShare,
      ifCalledTotal: ifCalledPerShare * 100 * n,
      ifCallExpiresPerShare: callCredit,
      cycleAnnIfCalled,
    };
  }
  return {
    contracts: n,
    cashRequired,
    putPremium,
    basisIfAssigned,
    discountIfAssigned: spot > 0 ? (spot - basisIfAssigned) / spot : null,
    putRoc,
    putAnnRoc,
    breakeven: basisIfAssigned,
    otmPnl: putPremium,
    call,
  };
}

export function calculatorHref(q: {
  tab?: "payoff" | "cycle" | "income";
  ticker?: string;
  preset?: string;
  strike?: number;
  expiry?: string;
  credit?: number;
  spot?: number;
  dte?: number;
  iv?: number;
  hv?: number;
  callStrike?: number;
  callCredit?: number;
  earnDays?: number | null;
  spreadPct?: number | null;
}): string {
  const p = new URLSearchParams();
  if (q.tab) p.set("tab", q.tab);
  if (q.ticker) p.set("ticker", q.ticker.toUpperCase());
  if (q.preset) p.set("preset", q.preset);
  if (q.strike != null) p.set("strike", String(q.strike));
  if (q.expiry) p.set("expiry", q.expiry);
  if (q.credit != null) p.set("credit", String(Number(q.credit.toFixed(4))));
  if (q.spot != null) p.set("spot", String(Number(q.spot.toFixed(4))));
  if (q.dte != null) p.set("dte", String(q.dte));
  if (q.iv != null) p.set("iv", String(Number(q.iv.toFixed(4))));
  if (q.hv != null) p.set("hv", String(Number(q.hv.toFixed(4))));
  if (q.callStrike != null) p.set("callStrike", String(q.callStrike));
  if (q.callCredit != null) p.set("callCredit", String(Number(q.callCredit.toFixed(4))));
  if (q.earnDays != null && Number.isFinite(q.earnDays)) p.set("earnDays", String(Math.round(q.earnDays)));
  if (q.spreadPct != null && Number.isFinite(q.spreadPct)) p.set("spreadPct", String(Number(q.spreadPct.toFixed(4))));
  const s = p.toString();
  return s ? `/wheel/calculator?${s}` : "/wheel/calculator";
}
