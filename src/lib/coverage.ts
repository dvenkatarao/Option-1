import { sql } from "drizzle-orm";
import { db } from "@/db";
import { etfHistory, etfs } from "@/db/schema";
import { getQuotes } from "./etf-service";
import { getSnapshotSummary, getSpreadStats } from "./snapshots";
import { assetClassOf } from "./recommend";
import { getEffectiveEtfUniverse } from "./etf-universe-discovery";

/**
 * Data coverage audit: how many ETFs actually have each field populated, using the real database and
 * a live quote pull. Purpose: decide what features can be built on current data (no assumptions).
 */

export type Field = { key: string; label: string; group: string; have: number; total: number; pct: number | null; note?: string };
export type Readiness = { feature: string; component: string; pct: number | null; status: "ready" | "partial" | "not ready" | "unknown" | "info only"; basis: string };

const pctOf = (have: number, total: number) => (total > 0 ? have / total : null);
const status = (p: number | null): Readiness["status"] => (p == null ? "unknown" : p >= 0.9 ? "ready" : p >= 0.6 ? "partial" : "not ready");

export async function computeCoverage() {
  const [rows, universe] = await Promise.all([db.select().from(etfs), getEffectiveEtfUniverse()]);
  const hist = await db
    .select({
      ticker: etfHistory.ticker,
      bars: sql<number>`jsonb_array_length(${etfHistory.data}->'t')`,
      divs: sql<number>`jsonb_array_length(${etfHistory.data}->'d')`,
    })
    .from(etfHistory);
  const histMap = new Map(hist.map((h) => [h.ticker, h]));

  const hydrated = rows.filter((r) => r.metrics);
  const failed = rows.filter((r) => !r.metrics && r.lastError);
  const N = hydrated.length;
  const field = (key: string, label: string, group: string, test: (r: (typeof rows)[number]) => boolean, note?: string): Field => {
    const have = hydrated.filter(test).length;
    return { key, label, group, have, total: N, pct: pctOf(have, N), note };
  };
  const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);

  const fields: Field[] = [
    field("name", "Fund name", "Identity", (r) => !!r.name),
    field("category", "Category", "Identity", (r) => !!r.category),
    field("family", "Fund family / issuer", "Identity", (r) => !!r.family),
    field("inception", "Inception date", "Identity", (r) => !!r.inceptionDate),
    field("expense", "Expense ratio", "Cost & size", (r) => finite(r.expenseRatio)),
    field("turnover", "Holdings turnover (reported, > 0)", "Cost & size", (r) => finite(r.turnover) && (r.turnover as number) > 0, "A value of 0 is treated as not reported (some funds, e.g. commodity or crypto trusts, return 0). Turnover is shown on ETF pages but not used in any grade."),
    field("aum", "Total assets (AUM)", "Cost & size", (r) => finite(r.totalAssets)),
    field("holdings", "Top holdings listed", "Holdings", (r) => (r.profile?.holdings?.length ?? 0) > 0, "Yahoo exposes the top ~10 only"),
    field("holdingW", "Top holdings with weights", "Holdings", (r) => (r.profile?.holdings ?? []).some((h) => finite(h.weight))),
    field("sectors", "Sector weights", "Holdings", (r) => (r.profile?.sectors?.length ?? 0) > 0),
    field("alloc", "Stock/bond/cash allocation", "Holdings", (r) => finite(r.profile?.allocation?.stock) || finite(r.profile?.allocation?.bond)),
    field("nav", "NAV price present", "Pricing", (r) => finite(r.navPrice) && (r.navPrice ?? 0) > 0),
    field(
      "navSane",
      "NAV within 5% of last close",
      "Pricing",
      (r) => finite(r.navPrice) && (r.navPrice ?? 0) > 0 && finite(r.lastClose) && Math.abs((r.lastClose as number) / (r.navPrice as number) - 1) < 0.05,
      "Low values mean Yahoo's NAV is stale/unreliable, so premium/discount cannot be shown",
    ),
    field("beta", "3Y beta", "Risk", (r) => finite(r.beta3y)),
    field("ret3y", "3Y return computed", "Risk", (r) => finite(r.metrics?.returns["3Y"].total)),
    field("vol3y", "3Y volatility computed", "Risk", (r) => finite(r.metrics?.vol3y)),
    field("dd3y", "3Y max drawdown computed", "Risk", (r) => finite(r.metrics?.maxDrawdown3y)),
    field("yield", "TTM yield computed", "Income", (r) => finite(r.metrics?.dividends.ttmYield)),
    field("hist5", "~5 years of daily history (1,200+ bars)", "History", (r) => (histMap.get(r.ticker)?.bars ?? 0) >= 1200, "Approximation only: similarity calculations separately require five calendar years of common history and at least 60 paired returns."),
    field("hist10", "9+ years of daily history", "History", (r) => (histMap.get(r.ticker)?.bars ?? 0) >= 2250),
    field("hist200", "200+ daily closes", "History", (r) => (histMap.get(r.ticker)?.bars ?? 0) >= 200, "Minimum stored split-adjusted daily closes for the 50/200-day ETF trend state."),
  ];

  // Live quote fields (not stored today). Bid/ask are frequently 0 outside market hours.
  const tickers = hydrated.map((r) => r.ticker);
  const q = tickers.length ? await getQuotes(tickers) : { quotes: new Map(), fetchedAt: null, stale: false };
  const quoteList = [...q.quotes.values()];
  const QN = quoteList.length;
  const marketStates = [...new Set(quoteList.map((x) => x.marketState).filter(Boolean))];
  const qf = (key: string, label: string, test: (x: (typeof quoteList)[number]) => boolean, note?: string): Field => {
    const have = quoteList.filter(test).length;
    return { key, label, group: "Live quote (not stored yet)", have, total: QN, pct: pctOf(have, QN), note };
  };
  const quoteFields: Field[] = [
    qf("qPrice", "Live price", (x) => finite(x.price)),
    qf("qVol", "Day volume", (x) => finite(x.volume) && (x.volume as number) > 0),
    qf("qAvgVol", "3-month average volume", (x) => finite(x.avgVolume3m) && (x.avgVolume3m as number) > 0),
    qf("qBidAsk", "Bid and ask (positive, ask >= bid)", (x) => finite(x.bid) && finite(x.ask) && (x.bid as number) > 0 && (x.ask as number) >= (x.bid as number), `Market state(s) at check: ${marketStates.join(", ") || "unknown"}. Re-run during US market hours for a fair reading.`),
    qf("qNet", "Net assets (quote feed)", (x) => finite(x.netAssets) && (x.netAssets as number) > 0),
  ];

  // Real spread history (stored samples), measured against the minimum needed to use it in the grade.
  const [snap, spreads] = await Promise.all([getSnapshotSummary(), getSpreadStats()]);
  const spreadUsable = tickers.filter((t) => {
    const s = spreads.get(t);
    return !!s && s.n >= snap.minSamples && s.days >= snap.minDays;
  }).length;
  const spreadPct = pctOf(spreadUsable, N);

  const byKey = Object.fromEntries([...fields, ...quoteFields].map((f) => [f.key, f]));
  const p = (k: string) => byKey[k]?.pct ?? null;
  const R = (feature: string, component: string, pct: number | null, basis: string): Readiness => ({ feature, component, pct, status: status(pct), basis });
  const readiness: Readiness[] = [
    R("Fund quality grade", "Cost (expense ratio)", p("expense"), "Expense ratio"),
    R("Fund quality grade", "Size", p("aum"), "Total assets"),
    R("Fund quality grade", "Age", p("inception"), "Inception date"),
    R("Fund quality grade", "Concentration (top-10 weight)", p("holdingW"), "Top holdings with weights (top-10 only)"),
    R("Fund quality grade", "Liquidity (volume)", p("qAvgVol"), "3-month average volume, needs a live quote"),
    R("Fund quality grade", "Trading spread (stored history)", spreadPct, `Funds with at least ${snap.minSamples} samples over ${snap.minDays} days; ${snap.samples} samples stored so far. Until then liquidity uses volume only.`),
    { feature: "Fund quality grade", component: "NAV premium/discount", pct: p("navSane"), status: "info only", basis: "Shown on ETF pages for information only and NOT used in the grade: Yahoo NAV is usually the prior day's value, so the gap is mostly one day of price movement." },
    R("Fund quality grade", "Distribution history / NAV erosion", p("yield"), "Computed from price + dividend history"),
    R("Similar ETF groups", "Five-year return correlation", p("hist5"), "The calculation requires five calendar years of common history plus 60 paired daily returns; this field is an approximate bar-count coverage indicator."),
    R("Similar ETF groups", "Top-10 holdings overlap (lower bound)", p("holdingW"), "Requires at least five weighted holdings in each fund; provider lists are partial."),
    R("Guided ETF advisor", "Fund category", p("category"), "Used to map funds to portfolio slices"),
    R("Guided ETF advisor", "Asset-class split", p("alloc"), "Reported stock/bond/cash allocation"),
    R("Guided ETF advisor", "Cost + size for picking core funds", Math.min(p("expense") ?? 0, p("aum") ?? 0), "Lower of expense-ratio and AUM coverage"),
    R("ETF trend signals", "Stored-history 50/200-day SMA + RSI14", p("hist200"), "Requires 200 valid split-adjusted daily closes; descriptive context, not a forecast."),
    { feature: "ETF recommendation scores", component: "Holdings-weighted analyst consensus", pct: null, status: "unknown", basis: "Loaded on demand only. Each fund's recommendation score is included only when stock recommendation data covers at least 50% of its reported top-holdings weight; actual coverage is returned with the ranking." },
  ];

  // Coverage by asset class so gaps (e.g. bond funds without holdings) are visible.
  const classes = new Map<string, { n: number; holdings: number; expense: number; aum: number; alloc: number }>();
  for (const r of hydrated) {
    const c = assetClassOf(r.category, r.profile?.allocation);
    const e = classes.get(c) ?? { n: 0, holdings: 0, expense: 0, aum: 0, alloc: 0 };
    e.n++;
    if ((r.profile?.holdings ?? []).some((h) => finite(h.weight))) e.holdings++;
    if (finite(r.expenseRatio)) e.expense++;
    if (finite(r.totalAssets)) e.aum++;
    if (finite(r.profile?.allocation?.stock) || finite(r.profile?.allocation?.bond)) e.alloc++;
    classes.set(c, e);
  }

  const missingExpense = hydrated.filter((r) => !finite(r.expenseRatio)).map((r) => r.ticker);
  const refreshedAts = hydrated.map((r) => r.refreshedAt?.getTime()).filter((x): x is number => !!x);

  return {
    generatedAt: new Date().toISOString(),
    universeSize: universe.status.totalCount,
    universe: universe.status,
    inDatabase: rows.length,
    hydrated: N,
    failed: failed.map((r) => ({ ticker: r.ticker, error: r.lastError })),
    oldestRefresh: refreshedAts.length ? new Date(Math.min(...refreshedAts)).toISOString() : null,
    quotesReceived: QN,
    quotesFetchedAt: q.fetchedAt,
    fields: [...fields, ...quoteFields],
    readiness,
    byAssetClass: [...classes.entries()].map(([assetClass, v]) => ({ assetClass, ...v })).sort((a, b) => b.n - a.n),
    missingExpense,
    spreadHistory: { ...snap, fundsWithUsableSpread: spreadUsable },
  };
}

export type CoverageReport = Awaited<ReturnType<typeof computeCoverage>>;
