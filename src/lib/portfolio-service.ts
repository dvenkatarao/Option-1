import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  portfolios,
  positions,
  transactions,
  etfs,
  cacheEntries,
  type PortfolioRecord,
  type PositionRecord,
  type TransactionRecord,
} from "@/db/schema";
import { getQuotes, getEtf, getHistories, refreshEtf } from "./etf-service";
import { alignedStats } from "./metrics";
import { getEnv } from "./env";
import { getRiskFree } from "./data";
import { generateId, maskAccountNumber } from "./security";
import { BrokerType, SUPPORTED_BROKERS, ParsedPositionImport } from "./brokers/types";
import { computeCashFlowSummary, depositAwarePerformance, xirr } from "./portfolio-cashflows";
import { overlapMatrixForPortfolio } from "./portfolio-overlap";

export interface PositionWithAnalytics extends PositionRecord {
  name?: string;
  category?: string;
  expenseRatio?: number | null;
  ttmYield?: number | null;
  annualDividendIncome: number;
  erosionLevel?: "None" | "Mild" | "Moderate" | "Severe" | "n/a";
  portfolioName?: string;
  brokerType?: string;
  weight: number; // percentage of portfolio
  dayChange?: number | null;
  dayChangePct?: number | null;
  /** Where currentPrice came from. "cost_basis" means NO market price was available (value is not market-based). */
  priceSource: "live" | "last_close" | "stored" | "cost_basis";
}

export interface MonthlyDividendEstimate {
  month: string; // "Jan", "Feb", etc.
  amount: number;
}

export interface SectorWeight {
  sector: string;
  weight: number; // 0 to 1
  marketValue: number;
}

export interface AssetClassWeight {
  assetClass: string;
  weight: number;
  marketValue: number;
}

export interface BenchmarkComparison {
  benchmarkTicker: string;
  benchmarkName: string;
  portfolioBeta: number | null;
  portfolioSharpe: number | null;
  riskFreeRate: number | null;
  weightedExpenseRatio: number | null;
  annualFeeDragDollars: number | null;
  /** Annualised return and volatility of the current-weights portfolio over the trailing window used for Sharpe/beta. */
  portfolioReturn: number | null;
  portfolioVol: number | null;
  /** Human-readable basis, e.g. "trailing 1Y daily returns, current weights, 92% of value covered". Null when not computable. */
  statsBasis: string | null;
}

export interface PortfolioAnalyticsSummary {
  portfolioCount: number;
  positionCount: number;
  totalMarketValue: number;
  totalCostBasis: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPct: number;
  todayPl: number;
  todayPlPct: number;
  annualDividendIncome: number;
  portfolioYieldPct: number;
  weightedExpenseRatio: number;
  annualFeeDollars: number;
  sectorBreakdown: SectorWeight[];
  assetClassBreakdown: AssetClassWeight[];
  monthlyDividends: MonthlyDividendEstimate[];
  benchmark: BenchmarkComparison;
  erosionAlerts: {
    ticker: string;
    level: string;
    marketValue: number;
    weight: number;
  }[];
  // Sprint B — cashflow & overlap
  cashFlow?: {
    totalDeposits: number;
    totalWithdrawals: number;
    netDeposits: number;
    totalDividends: number;
    totalFees: number;
    realizedGain: number;
    realizedGainPct: number | null;
    tradeCount: { buys: number; sells: number; dividends: number; deposits: number; withdrawals: number };
  };
  depositAware?: {
    gainVsDeposits: number;
    gainVsDepositsPct: number | null;
    mwr: number | null; // XIRR annualized
    mwrLabel: string;
  };
  overlap?: { tickers: string[]; cells: { a: string; b: string; overlap: number; overlapPct: number; common: { symbol: string; wa: number; wb: number }[] }[] };
  positions: PositionWithAnalytics[];
  /** Safe API-facing portfolio metadata. Credential ciphertext and sync-error internals are never serialized. */
  portfolios: Omit<PortfolioRecord, "encryptedCredentials" | "syncError">[];
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Ensures demo portfolios exist if table is empty, providing immediate rich data.
 */
export async function seedDemoPortfoliosIfEmpty(): Promise<void> {
  // Opt-in (SEED_DEMO_DATA=true) and one-time: deleting the demo portfolios must not resurrect them.
  if (getEnv().SEED_DEMO_DATA !== "true") return;
  const SEED_KEY = "seed:demo:v1";
  const done = await db.select({ key: cacheEntries.key }).from(cacheEntries).where(eq(cacheEntries.key, SEED_KEY)).limit(1);
  if (done.length > 0) return;
  const existing = await db.select({ id: portfolios.id }).from(portfolios).limit(1);
  if (existing.length > 0) return;
  await db.insert(cacheEntries).values({ key: SEED_KEY, payload: { seededAt: new Date().toISOString() } }).onConflictDoNothing();

  // 1. Charles Schwab - Dividend & Income Strategy
  const p1Id = generateId("port");
  await db.insert(portfolios).values({
    id: p1Id,
    name: "Schwab Dividend Income",
    brokerType: "schwab",
    accountNumberMasked: maskAccountNumber("88421098"),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
    isDemo: true,
  });

  const p1Positions = [
    { ticker: "SCHD", qty: 150, cost: 78.5, date: "2023-08-14" },
    { ticker: "JEPI", qty: 120, cost: 55.4, date: "2023-11-20" },
    { ticker: "VOO", qty: 35, cost: 480.2, date: "2023-10-10" },
    { ticker: "JEPQ", qty: 90, cost: 52.1, date: "2024-02-05" },
    { ticker: "VYM", qty: 85, cost: 118.6, date: "2023-09-12" },
  ];

  for (const pos of p1Positions) {
    await db.insert(positions).values({
      id: generateId("pos"),
      portfolioId: p1Id,
      ticker: pos.ticker,
      quantity: pos.qty,
      averageCostBasis: pos.cost,
      purchaseDate: pos.date,
      assetType: "ETF",
    });
  }

  // 2. Fidelity - Core Growth & Tech
  const p2Id = generateId("port");
  await db.insert(portfolios).values({
    id: p2Id,
    name: "Fidelity Growth & Tech",
    brokerType: "fidelity",
    accountNumberMasked: maskAccountNumber("91234567"),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
    isDemo: true,
  });

  const p2Positions = [
    { ticker: "VTI", qty: 110, cost: 260.5, date: "2023-05-12" },
    { ticker: "QQQM", qty: 80, cost: 188.4, date: "2023-09-18" },
    { ticker: "SMH", qty: 40, cost: 215.2, date: "2024-01-22" },
    { ticker: "VUG", qty: 45, cost: 340.0, date: "2023-12-01" },
  ];

  for (const pos of p2Positions) {
    await db.insert(positions).values({
      id: generateId("pos"),
      portfolioId: p2Id,
      ticker: pos.ticker,
      quantity: pos.qty,
      averageCostBasis: pos.cost,
      purchaseDate: pos.date,
      assetType: "ETF",
    });
  }

  // 3. Vanguard - Global Balanced 401(k)
  const p3Id = generateId("port");
  await db.insert(portfolios).values({
    id: p3Id,
    name: "Vanguard Retirement 401k",
    brokerType: "vanguard",
    accountNumberMasked: maskAccountNumber("55667788"),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
    isDemo: true,
  });

  const p3Positions = [
    { ticker: "VOO", qty: 75, cost: 495.2, date: "2023-04-10" },
    { ticker: "VXUS", qty: 180, cost: 58.7, date: "2023-01-20" },
    { ticker: "BND", qty: 140, cost: 72.8, date: "2023-06-15" },
    { ticker: "VIG", qty: 60, cost: 175.4, date: "2023-07-28" },
  ];

  for (const pos of p3Positions) {
    await db.insert(positions).values({
      id: generateId("pos"),
      portfolioId: p3Id,
      ticker: pos.ticker,
      quantity: pos.qty,
      averageCostBasis: pos.cost,
      purchaseDate: pos.date,
      assetType: "ETF",
    });
  }
}

/**
 * Calculates complete portfolio overview and analytics across all or specific portfolios.
 */
export async function getPortfolioAnalytics(
  targetPortfolioId?: string,
): Promise<PortfolioAnalyticsSummary> {
  await seedDemoPortfoliosIfEmpty();

  // 1. Fetch portfolios
  let portfolioList: PortfolioRecord[] = [];
  if (targetPortfolioId && targetPortfolioId !== "all") {
    portfolioList = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, targetPortfolioId));
  } else {
    portfolioList = await db.select().from(portfolios);
  }

  if (portfolioList.length === 0) {
    return getEmptySummary();
  }

  const safePortfolioList = portfolioList.map(({ encryptedCredentials: _credentials, syncError: _syncError, ...portfolio }) => portfolio);
  const portfolioIds = portfolioList.map((p) => p.id);
  const portfolioMap = new Map(portfolioList.map((p) => [p.id, p]));

  // 2. Fetch positions
  const posList = await db
    .select()
    .from(positions)
    .where(inArray(positions.portfolioId, portfolioIds));

  if (posList.length === 0) {
    return {
      ...getEmptySummary(),
      portfolios: safePortfolioList,
      portfolioCount: portfolioList.length,
    };
  }

  // 3. Fetch live quotes for all tickers
  const uniqueTickers = Array.from(new Set(posList.map((p) => p.ticker.toUpperCase())));
  const quotesRes = await getQuotes(uniqueTickers);
  const rfRes = await getRiskFree();

  // 4. Fetch ETF metadata and profiles
  const etfRows = await db
    .select()
    .from(etfs)
    .where(inArray(etfs.ticker, uniqueTickers));
  const etfMap = new Map(etfRows.map((e) => [e.ticker, e]));

  // 5. Calculate position-level metrics
  let totalMarketValue = 0;
  let totalCostBasis = 0;
  let todayPl = 0;
  let totalAnnualDividends = 0;

  const positionsWithAnalytics: PositionWithAnalytics[] = [];

  for (const pos of posList) {
    const ticker = pos.ticker.toUpperCase();
    const quote = quotesRes.quotes.get(ticker);
    const etf = etfMap.get(ticker);

    let price: number;
    let priceSource: PositionWithAnalytics["priceSource"];
    if (quote?.price != null) {
      price = quote.price;
      priceSource = "live";
    } else if (etf?.lastClose != null) {
      price = etf.lastClose;
      priceSource = "last_close";
    } else if (pos.currentPrice != null) {
      price = pos.currentPrice;
      priceSource = "stored";
    } else {
      price = pos.averageCostBasis; // no market price at all: flagged so the UI never presents it as market value
      priceSource = "cost_basis";
    }
    const marketValue = pos.quantity * price;
    const costBasis = pos.quantity * pos.averageCostBasis;
    const unrealizedGain = marketValue - costBasis;
    const unrealizedGainPct = costBasis > 0 ? unrealizedGain / costBasis : 0;

    const dayChange = quote?.change ?? null;
    const dayChangePct = quote?.changePct ?? null;
    const posDayPl = dayChange !== null ? pos.quantity * dayChange : 0;

    // Dividend metrics
    const ttmAmount = etf?.metrics?.dividends?.ttmAmount ?? 0;
    const ttmYield = etf?.metrics?.dividends?.ttmYield ?? null;
    const annualDividend = pos.quantity * ttmAmount;

    totalMarketValue += marketValue;
    totalCostBasis += costBasis;
    todayPl += posDayPl;
    totalAnnualDividends += annualDividend;

    const parentPort = portfolioMap.get(pos.portfolioId);

    positionsWithAnalytics.push({
      ...pos,
      currentPrice: price,
      marketValue,
      unrealizedGain,
      unrealizedGainPct,
      name: etf?.name ?? quote?.name ?? ticker,
      category: etf?.category ?? "US Equity / ETF",
      expenseRatio: etf?.expenseRatio ?? null,
      ttmYield,
      annualDividendIncome: annualDividend,
      erosionLevel: etf?.metrics?.erosion?.level ?? "n/a",
      portfolioName: parentPort?.name,
      brokerType: parentPort?.brokerType,
      weight: 0, // Will be computed after totalMarketValue is finalized
      dayChange,
      dayChangePct,
      priceSource,
    });
  }

  // Set weights
  for (const p of positionsWithAnalytics) {
    p.weight = totalMarketValue > 0 ? p.marketValue! / totalMarketValue : 0;
  }

  // Sort positions by market value descending
  positionsWithAnalytics.sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));

  // 6. Portfolio-level totals
  const totalUnrealizedGain = totalMarketValue - totalCostBasis;
  const totalUnrealizedGainPct = totalCostBasis > 0 ? totalUnrealizedGain / totalCostBasis : 0;
  const previousDayValue = totalMarketValue - todayPl;
  const todayPlPct = previousDayValue > 0 ? todayPl / previousDayValue : 0;
  const portfolioYieldPct = totalMarketValue > 0 ? totalAnnualDividends / totalMarketValue : 0;

  // 7. Weighted expense ratio & fee drag
  let weightedExpenseRatio = 0;
  let expenseWeightCovered = 0;
  for (const p of positionsWithAnalytics) {
    if (p.expenseRatio !== null && p.expenseRatio !== undefined) {
      weightedExpenseRatio += p.weight * p.expenseRatio;
      expenseWeightCovered += p.weight;
    }
  }
  if (expenseWeightCovered > 0) {
    weightedExpenseRatio = weightedExpenseRatio / expenseWeightCovered;
  }
  const annualFeeDollars = totalMarketValue * weightedExpenseRatio;

  // 8. Asset Allocation & Sector Look-Through Breakdown
  const sectorMap = new Map<string, number>();
  const assetClassMap = new Map<string, number>();

  for (const pos of positionsWithAnalytics) {
    const etf = etfMap.get(pos.ticker);
    const posVal = pos.marketValue || 0;

    // Asset class categorization
    const cat = (etf?.category || "").toLowerCase();
    const assetType = pos.assetType;

    if (assetType === "FUTURES") {
      assetClassMap.set("Futures & Derivatives", (assetClassMap.get("Futures & Derivatives") || 0) + posVal);
    } else if (cat.includes("bond") || cat.includes("government") || cat.includes("treasury")) {
      assetClassMap.set("Fixed Income / Bonds", (assetClassMap.get("Fixed Income / Bonds") || 0) + posVal);
    } else if (cat.includes("commodity") || cat.includes("precious metals")) {
      assetClassMap.set("Commodities & Real Assets", (assetClassMap.get("Commodities & Real Assets") || 0) + posVal);
    } else if (cat.includes("cash") || cat.includes("money market")) {
      assetClassMap.set("Cash Equivalents", (assetClassMap.get("Cash Equivalents") || 0) + posVal);
    } else {
      assetClassMap.set("Equities / Stocks", (assetClassMap.get("Equities / Stocks") || 0) + posVal);
    }

    // Sector breakdown look-through
    const sectors = etf?.profile?.sectors || [];
    if (sectors.length > 0) {
      for (const s of sectors) {
        const sectorVal = posVal * s.weight;
        const normSector = normalizeSectorName(s.sector);
        sectorMap.set(normSector, (sectorMap.get(normSector) || 0) + sectorVal);
      }
    } else {
      // Direct sector or general allocation
      const fallbackSector = getFallbackSector(etf?.category);
      sectorMap.set(fallbackSector, (sectorMap.get(fallbackSector) || 0) + posVal);
    }
  }

  const sectorBreakdown: SectorWeight[] = Array.from(sectorMap.entries())
    .map(([sector, mv]) => ({
      sector,
      marketValue: mv,
      weight: totalMarketValue > 0 ? mv / totalMarketValue : 0,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8); // Top 8 sectors

  const assetClassBreakdown: AssetClassWeight[] = Array.from(assetClassMap.entries())
    .map(([assetClass, mv]) => ({
      assetClass,
      marketValue: mv,
      weight: totalMarketValue > 0 ? mv / totalMarketValue : 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  // 9. 12-Month Projected Dividend Calendar
  const monthlyDividends: MonthlyDividendEstimate[] = MONTH_NAMES.map((m) => ({
    month: m,
    amount: 0,
  }));

  for (const pos of positionsWithAnalytics) {
    const etf = etfMap.get(pos.ticker);
    const freq = etf?.metrics?.dividends?.frequency || "Quarterly";
    const annualDiv = pos.annualDividendIncome;
    if (annualDiv <= 0) continue;

    if (freq === "Monthly") {
      for (let i = 0; i < 12; i++) {
        monthlyDividends[i].amount += annualDiv / 12;
      }
    } else if (freq === "Quarterly") {
      // Typical quarterly distribution months (Mar, Jun, Sep, Dec)
      [2, 5, 8, 11].forEach((mIdx) => {
        monthlyDividends[mIdx].amount += annualDiv / 4;
      });
    } else {
      // Semi-annual or annual default
      [5, 11].forEach((mIdx) => {
        monthlyDividends[mIdx].amount += annualDiv / 2;
      });
    }
  }

  // Round monthly dividend values
  for (const md of monthlyDividends) {
    md.amount = Math.round(md.amount * 100) / 100;
  }

  // 10. Risk diagnostics from real price history (no assumed returns / volatilities)
  const rfRate = rfRes.rate;
  const stats = await computePortfolioStats(
    positionsWithAnalytics.map((p) => ({ ticker: p.ticker, value: p.marketValue ?? 0 })),
    totalMarketValue,
    rfRate,
  );

  const benchmark: BenchmarkComparison = {
    benchmarkTicker: "VOO",
    benchmarkName: "Vanguard S&P 500 ETF",
    portfolioBeta: stats.beta,
    portfolioSharpe: stats.sharpe,
    riskFreeRate: rfRate,
    weightedExpenseRatio,
    annualFeeDragDollars: Math.round(annualFeeDollars * 100) / 100,
    portfolioReturn: stats.annReturn,
    portfolioVol: stats.annVol,
    statsBasis: stats.basis,
  };

  // 11. NAV Erosion Scanner
  const erosionAlerts = positionsWithAnalytics
    .filter((p) => p.erosionLevel === "Moderate" || p.erosionLevel === "Severe")
    .map((p) => ({
      ticker: p.ticker,
      level: p.erosionLevel || "Moderate",
      marketValue: p.marketValue || 0,
      weight: p.weight,
    }));

  // 12. Sprint B — Cashflow & realized P&L from ledger (deposit-aware)
  let cashFlow: PortfolioAnalyticsSummary["cashFlow"] | undefined;
  let depositAware: PortfolioAnalyticsSummary["depositAware"] | undefined;
  let overlap: PortfolioAnalyticsSummary["overlap"] | undefined;
  try {
    const txRows = await db.select().from(transactions).where(inArray(transactions.portfolioId, portfolioIds));
    if (txRows.length) {
      const cf = computeCashFlowSummary(txRows as TransactionRecord[]);
      cashFlow = {
        totalDeposits: cf.totalDeposits,
        totalWithdrawals: cf.totalWithdrawals,
        netDeposits: cf.netDeposits,
        totalDividends: cf.totalDividends,
        totalFees: cf.totalFees,
        realizedGain: cf.realizedGain,
        realizedGainPct: cf.realizedGainPct,
        tradeCount: cf.tradeCount,
      };
      const perf = depositAwarePerformance(totalMarketValue, cf);
      // Build XIRR cashflows: deposits outflows negative, withdrawals/dividends positive, final value positive today
      const todayStr = new Date().toISOString().slice(0, 10);
      const flows: { date: string; amount: number }[] = txRows
        .filter((t) => t.type === "DEPOSIT" || t.type === "WITHDRAWAL")
        .map((t) => ({ date: t.transactionDate, amount: t.type === "DEPOSIT" ? -Math.abs(t.amount) : Math.abs(t.amount) }));
      // Add initial deposit if no deposits but we have positions (use cost basis as proxy)
      if (!flows.length && totalCostBasis > 0) {
        // Use earliest purchase date as initial outflow
        const earliest = positionsWithAnalytics.reduce((min, p) => (p.purchaseDate && p.purchaseDate < min ? p.purchaseDate : min), todayStr);
        flows.push({ date: earliest, amount: -totalCostBasis });
      }
      // Terminal value as positive inflow today
      if (totalMarketValue > 0) flows.push({ date: todayStr, amount: totalMarketValue });
      // Dividends as positive flows on their dates
      for (const t of txRows.filter((x) => x.type === "DIVIDEND")) flows.push({ date: t.transactionDate, amount: Math.abs(t.amount) });
      flows.sort((a, b) => a.date.localeCompare(b.date));
      const irr = flows.length >= 2 ? xirr(flows) : null;
      depositAware = {
        gainVsDeposits: perf.GainVsDeposits,
        gainVsDepositsPct: perf.GainVsDepositsPct,
        mwr: irr,
        mwrLabel: irr == null ? "Not enough dated cashflows for IRR" : `Money-weighted (IRR): ${(irr * 100).toFixed(2)}% annualized`,
      };
    } else if (totalCostBasis > 0) {
      // Fallback when ledger empty: use cost basis as net deposits proxy
      cashFlow = { totalDeposits: totalCostBasis, totalWithdrawals: 0, netDeposits: totalCostBasis, totalDividends: 0, totalFees: 0, realizedGain: 0, realizedGainPct: null, tradeCount: { buys: 0, sells: 0, dividends: 0, deposits: 0, withdrawals: 0 } };
      const g = totalMarketValue - totalCostBasis;
      depositAware = { gainVsDeposits: g, gainVsDepositsPct: totalCostBasis ? g / totalCostBasis : null, mwr: null, mwrLabel: "Add DEPOSIT transactions to compute IRR" };
    }

    // Overlap matrix from holdings (lower-bound via top-10)
    if (posList.length >= 2) {
      const etfProfiles = new Map<string, { symbol: string | null; weight: number | null }[]>();
      for (const e of etfRows) etfProfiles.set(e.ticker, e.profile?.holdings ?? null as any);
      const matrix = overlapMatrixForPortfolio(posList, etfProfiles as any);
      if (matrix.tickers.length >= 2) overlap = { tickers: matrix.tickers, cells: matrix.cells as any };
    }
  } catch {
    // analytics extensions must never break the main summary
  }

  return {
    portfolioCount: portfolioList.length,
    positionCount: posList.length,
    totalMarketValue: Math.round(totalMarketValue * 100) / 100,
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalUnrealizedGain: Math.round(totalUnrealizedGain * 100) / 100,
    totalUnrealizedGainPct: Math.round(totalUnrealizedGainPct * 10000) / 10000,
    todayPl: Math.round(todayPl * 100) / 100,
    todayPlPct: Math.round(todayPlPct * 10000) / 10000,
    annualDividendIncome: Math.round(totalAnnualDividends * 100) / 100,
    portfolioYieldPct: Math.round(portfolioYieldPct * 10000) / 10000,
    weightedExpenseRatio: Math.round(weightedExpenseRatio * 10000) / 10000,
    annualFeeDollars: Math.round(annualFeeDollars * 100) / 100,
    sectorBreakdown,
    assetClassBreakdown,
    monthlyDividends,
    benchmark,
    erosionAlerts,
    cashFlow,
    depositAware,
    overlap,
    positions: positionsWithAnalytics,
    portfolios: safePortfolioList,
  };
}

type PortfolioStats = { beta: number | null; sharpe: number | null; annReturn: number | null; annVol: number | null; basis: string | null };
const NO_STATS: PortfolioStats = { beta: null, sharpe: null, annReturn: null, annVol: null, basis: null };
const DAY_S = 86400;

/**
 * Trailing-1Y statistics for the portfolio held at CURRENT weights, built from stored daily
 * total-return (adjusted close) series. Returns nulls (rendered as N/A) when coverage is too thin;
 * never falls back to assumed return/volatility figures.
 */
async function computePortfolioStats(
  holdings: { ticker: string; value: number }[],
  totalValue: number,
  rf: number | null,
): Promise<PortfolioStats> {
  if (totalValue <= 0) return NO_STATS;
  const byTicker = new Map<string, number>();
  for (const h of holdings) byTicker.set(h.ticker, (byTicker.get(h.ticker) ?? 0) + h.value);
  const hist = await getHistories([...byTicker.keys(), "VOO"]);

  const covered = [...byTicker.entries()].filter(([t]) => hist[t] && hist[t].t.length > 60);
  const coveredValue = covered.reduce((s, [, v]) => s + v, 0);
  if (!covered.length || coveredValue / totalValue < 0.8) return NO_STATS;

  // daily returns per ticker keyed by day
  const rets = covered.map(([t, v]) => {
    const h = hist[t];
    const cutoff = h.t[h.t.length - 1] - 365 * DAY_S;
    const m = new Map<number, number>();
    for (let i = 1; i < h.a.length; i++) {
      if (h.t[i] >= cutoff && h.a[i - 1] > 0) m.set(Math.floor(h.t[i] / DAY_S), h.a[i] / h.a[i - 1] - 1);
    }
    return { w: v / coveredValue, m };
  });
  const days = [...rets[0].m.keys()].filter((d) => rets.every((r) => r.m.has(d))).sort((a, b) => a - b);
  if (days.length < 120) return NO_STATS;

  const port = days.map((d) => rets.reduce((s, r) => s + r.w * r.m.get(d)!, 0));
  const mean = port.reduce((s, x) => s + x, 0) / port.length;
  const variance = port.reduce((s, x) => s + (x - mean) ** 2, 0) / (port.length - 1);
  const annVol = Math.sqrt(variance) * Math.sqrt(252);
  const growth = port.reduce((g, x) => g * (1 + x), 1);
  const annReturn = growth ** (252 / port.length) - 1;
  const sharpe = rf != null && annVol > 0 ? (annReturn - rf) / annVol : null;

  // Beta vs VOO via the shared aligned-returns routine (needs a synthetic index series).
  let beta: number | null = null;
  if (hist["VOO"]) {
    let idx = 100;
    const t: number[] = [];
    const a: number[] = [];
    days.forEach((d, i) => {
      idx *= 1 + port[i];
      t.push(d * DAY_S);
      a.push(idx);
    });
    beta = alignedStats({ t, c: a, a, d: [] }, hist["VOO"], 1).beta;
  }

  const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
  return {
    beta: r2(beta),
    sharpe: r2(sharpe),
    annReturn,
    annVol,
    basis: `trailing 1Y daily total returns at current weights (${days.length} days, ${Math.round((coveredValue / totalValue) * 100)}% of value covered)`,
  };
}

function normalizeSectorName(rawSector: string): string {
  const map: Record<string, string> = {
    technology: "Technology",
    financial_services: "Financial Services",
    healthcare: "Healthcare",
    consumer_cyclical: "Consumer Cyclical",
    communication_services: "Communication",
    industrials: "Industrials",
    consumer_defensive: "Consumer Defensive",
    energy: "Energy",
    utilities: "Utilities",
    realestate: "Real Estate",
    basic_materials: "Basic Materials",
  };
  return map[rawSector.toLowerCase()] || rawSector;
}

function getFallbackSector(category: string | null | undefined): string {
  if (!category) return "Broad Diversified";
  const cat = category.toLowerCase();
  if (cat.includes("tech") || cat.includes("semiconductor")) return "Technology";
  if (cat.includes("financial") || cat.includes("bank")) return "Financial Services";
  if (cat.includes("health") || cat.includes("biotech")) return "Healthcare";
  if (cat.includes("energy") || cat.includes("oil")) return "Energy";
  if (cat.includes("bond") || cat.includes("fixed")) return "Fixed Income";
  if (cat.includes("real estate")) return "Real Estate";
  return "Broad Diversified";
}

function getEmptySummary(): PortfolioAnalyticsSummary {
  return {
    portfolioCount: 0,
    positionCount: 0,
    totalMarketValue: 0,
    totalCostBasis: 0,
    totalUnrealizedGain: 0,
    totalUnrealizedGainPct: 0,
    todayPl: 0,
    todayPlPct: 0,
    annualDividendIncome: 0,
    portfolioYieldPct: 0,
    weightedExpenseRatio: 0,
    annualFeeDollars: 0,
    sectorBreakdown: [],
    assetClassBreakdown: [],
    monthlyDividends: MONTH_NAMES.map((m) => ({ month: m, amount: 0 })),
    benchmark: {
      benchmarkTicker: "VOO",
      benchmarkName: "Vanguard S&P 500 ETF",
      portfolioBeta: null,
      portfolioSharpe: null,
      riskFreeRate: null,
      weightedExpenseRatio: 0,
      annualFeeDragDollars: 0,
      portfolioReturn: null,
      portfolioVol: null,
      statsBasis: null,
    },
    erosionAlerts: [],
    positions: [],
    portfolios: [],
  };
}

/**
 * Writes positions to a portfolio inside one transaction.
 *  - "replace" (default, correct for statement snapshots and re-imports): quantity/cost become the file values.
 *  - "add": treats incoming rows as additional lots and blends the cost basis.
 * Re-importing the same file with "replace" is idempotent.
 */
export async function addPositionsToPortfolio(
  portfolioId: string,
  newPositions: ParsedPositionImport[],
  mode: "replace" | "add" = "replace",
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const cleaned = newPositions
    .map((p) => ({ ...p, ticker: p.ticker.toUpperCase().trim() }))
    .filter((p) => p.ticker && Number.isFinite(p.quantity) && p.quantity > 0 && Number.isFinite(p.averageCostBasis) && p.averageCostBasis >= 0);

  await db.transaction(async (tx) => {
    const existing = await tx.select().from(positions).where(eq(positions.portfolioId, portfolioId));
    const byTicker = new Map(existing.map((p) => [p.ticker.toUpperCase(), p]));
    for (const pos of cleaned) {
      const match = byTicker.get(pos.ticker);
      if (match) {
        let qty = pos.quantity;
        let cost = pos.averageCostBasis;
        if (mode === "add") {
          qty = match.quantity + pos.quantity;
          cost = (match.quantity * match.averageCostBasis + pos.quantity * pos.averageCostBasis) / qty;
        }
        await tx
          .update(positions)
          .set({
            quantity: qty,
            averageCostBasis: Math.round(cost * 10000) / 10000,
            purchaseDate: pos.purchaseDate ?? match.purchaseDate,
            assetType: pos.assetType ?? match.assetType,
            updatedAt: new Date(),
          })
          .where(eq(positions.id, match.id));
      } else {
        const row = {
          id: generateId("pos"),
          portfolioId,
          ticker: pos.ticker,
          quantity: pos.quantity,
          averageCostBasis: pos.averageCostBasis,
          purchaseDate: pos.purchaseDate || today,
          assetType: pos.assetType || "ETF",
        };
        await tx.insert(positions).values(row);
        byTicker.set(pos.ticker, { ...row, currentPrice: null, marketValue: null, unrealizedGain: null, unrealizedGainPct: null, lastPriceUpdatedAt: null, createdAt: new Date(), updatedAt: new Date() });
      }
    }
    await tx
      .update(portfolios)
      .set({ lastSyncedAt: new Date(), syncStatus: "synced", syncError: null, updatedAt: new Date() })
      .where(eq(portfolios.id, portfolioId));
  });

  // Hydrate analytics data for any ticker we have no stored ETF row for (fire-and-forget, bounded).
  const unknown = await db
    .select({ ticker: etfs.ticker })
    .from(etfs)
    .where(inArray(etfs.ticker, cleaned.map((p) => p.ticker)));
  const known = new Set(unknown.map((r) => r.ticker));
  for (const t of [...new Set(cleaned.map((p) => p.ticker))].filter((t) => !known.has(t)).slice(0, 10)) {
    refreshEtf(t).catch(() => undefined);
  }

  return cleaned.length;
}
