/**
 * Sprint B — Portfolio Cashflow & Realized P&L
 * Pure helpers that turn the `transactions` ledger into deposit-aware analytics.
 * No DB, no I/O — just deterministic math so it can be unit-tested.
 */

import type { TransactionRecord } from "@/db/schema";

export type CashFlowSummary = {
  totalDeposits: number;
  totalWithdrawals: number;
  netDeposits: number; // deposits - withdrawals
  totalDividends: number;
  totalFees: number;
  realizedProceeds: number; // sum of SELL amounts (signed positive)
  buyCostBasis: number; // sum of BUY amounts (cost)
  sellCostRemoved: number; // approximated cost removed via FIFO (see realizedGain)
  tradeCount: { buys: number; sells: number; dividends: number; deposits: number; withdrawals: number };
  realizedGain: number; // SELL proceeds - cost of shares sold (FIFO)
  realizedGainPct: number | null; // realizedGain / sellCostRemoved
  timeline: { date: string; type: string; amount: number; ticker?: string | null }[];
};

export type Lot = { qty: number; unitCost: number; date: string };

/**
 * FIFO lot tracker for realized gains.
 * BUY creates a lot; SELL consumes oldest lots first.
 * Fees are added to cost basis if present.
 */
export function computeCashFlowSummary(transactions: TransactionRecord[]): CashFlowSummary {
  const sorted = [...transactions].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.createdAt.getTime() - b.createdAt.getTime());

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDividends = 0;
  let totalFees = 0;
  let realizedProceeds = 0;
  let buyCost = 0;
  let buys = 0;
  let sells = 0;
  let dividends = 0;
  let deposits = 0;
  let withdrawals = 0;
  let realizedGain = 0;
  let sellCostRemoved = 0;

  // Per-ticker lot queue
  const lots = new Map<string, Lot[]>();

  const timeline: CashFlowSummary["timeline"] = [];

  for (const tx of sorted) {
    const fee = tx.fee ?? 0;
    totalFees += fee;

    timeline.push({ date: tx.transactionDate, type: tx.type, amount: tx.amount, ticker: tx.ticker });

    switch (tx.type) {
      case "DEPOSIT":
        totalDeposits += Math.abs(tx.amount);
        deposits++;
        break;
      case "WITHDRAWAL":
        totalWithdrawals += Math.abs(tx.amount);
        withdrawals++;
        break;
      case "DIVIDEND":
        totalDividends += Math.abs(tx.amount);
        dividends++;
        break;
      case "BUY": {
        buys++;
        const qty = tx.quantity ?? 0;
        const unit = tx.price != null ? tx.price : qty ? Math.abs(tx.amount) / qty : 0;
        const costPerShare = unit + (qty ? fee / qty : 0);
        const ticker = (tx.ticker ?? "").toUpperCase();
        if (ticker && qty > 0) {
          const q = lots.get(ticker) ?? [];
          q.push({ qty, unitCost: costPerShare, date: tx.transactionDate });
          lots.set(ticker, q);
        }
        buyCost += Math.abs(tx.amount) + fee;
        break;
      }
      case "SELL": {
        sells++;
        realizedProceeds += Math.abs(tx.amount);
        const ticker = (tx.ticker ?? "").toUpperCase();
        const qty = tx.quantity ?? 0;
        const sellFee = fee;
        // Compute cost of shares sold via FIFO
        let remaining = qty;
        let costRemoved = 0;
        const q = lots.get(ticker) ?? [];
        while (remaining > 1e-9 && q.length) {
          const lot = q[0];
          if (lot.qty <= remaining + 1e-9) {
            costRemoved += lot.qty * lot.unitCost;
            remaining -= lot.qty;
            q.shift();
          } else {
            costRemoved += remaining * lot.unitCost;
            lot.qty -= remaining;
            remaining = 0;
          }
        }
        // If we sold more than tracked lots (e.g., pre-history position), approximate at avg cost
        if (remaining > 1e-9) {
          // Fall back: use price field or amount/qty as cost proxy
          const fallbackUnit = tx.price ?? (qty ? Math.abs(tx.amount) / qty : 0);
          costRemoved += remaining * fallbackUnit;
        }
        sellCostRemoved += costRemoved;
        realizedGain += Math.abs(tx.amount) - sellFee - costRemoved;
        break;
      }
    }
  }

  const netDeposits = totalDeposits - totalWithdrawals;
  const realizedGainPct = sellCostRemoved > 0 ? realizedGain / sellCostRemoved : null;

  return {
    totalDeposits,
    totalWithdrawals,
    netDeposits,
    totalDividends,
    totalFees,
    realizedProceeds,
    buyCostBasis: buyCost,
    sellCostRemoved,
    tradeCount: { buys, sells, dividends, deposits, withdrawals },
    realizedGain,
    realizedGainPct,
    timeline,
  };
}

/**
 * Deposit-aware performance snapshot: current market value vs net deposits.
 * Total gain = marketValue + withdrawals - deposits - remaining cash? Simplified as marketValue - netDeposits + dividends - fees.
 * For a portfolio that started from deposits, this is the money made after contributions.
 */
export function depositAwarePerformance(marketValue: number, cf: CashFlowSummary) {
  const netFlows = cf.netDeposits; // positive = money in
  const totalGain = marketValue - netFlows + cf.totalDividends - cf.totalFees + cf.realizedGain; // note realizedGain already reflects sells, so we avoid double-count
  // Simpler headline: "invested vs what you have"
  const invested = cf.netDeposits > 0 ? cf.netDeposits : cf.buyCostBasis || marketValue;
  const GainVsDeposits = marketValue - cf.netDeposits;
  const GainVsDepositsPct = cf.netDeposits > 0 ? GainVsDeposits / cf.netDeposits : null;
  return { totalGain, invested, GainVsDeposits, GainVsDepositsPct };
}

/**
 * Very small XIRR solver (Newton + bisection fallback) for money-weighted return.
 * cashflows: array of { date: YYYY-MM-DD, amount: negative=outflow, positive=inflow }.
 * Returns annualized IRR as decimal or null.
 */
export function xirr(cashflows: { date: string; amount: number }[], guess = 0.1): number | null {
  if (cashflows.length < 2) return null;
  const t0 = Date.parse(`${cashflows[0].date}T00:00:00Z`);
  const times = cashflows.map((cf) => (Date.parse(`${cf.date}T00:00:00Z`) - t0) / (365.25 * 86400000));

  const npv = (r: number) => cashflows.reduce((s, cf, i) => s + cf.amount / Math.pow(1 + r, times[i]), 0);
  const dnpv = (r: number) => cashflows.reduce((s, cf, i) => s - (times[i] * cf.amount) / Math.pow(1 + r, times[i] + 1), 0);

  let r = guess;
  for (let iter = 0; iter < 50; iter++) {
    const f = npv(r);
    const df = dnpv(r);
    if (!Number.isFinite(f) || !Number.isFinite(df) || Math.abs(df) < 1e-12) break;
    const nr = r - f / df;
    if (!Number.isFinite(nr) || nr <= -0.99) break;
    if (Math.abs(nr - r) < 1e-9) return Math.abs(f) < 1e-6 ? nr : null;
    r = nr;
    if (Math.abs(f) < 1e-7) return r;
  }
  // Bisection fallback between -0.9 and 5 ( -90% to +500%)
  let lo = -0.9, hi = 5;
  let flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null; // no bracket
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return null;
}
