import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { etfHistory, etfs, type EtfProfileJson, type HistoryJson } from "@/db/schema";
import { cached, cachedOrNull } from "./cache";
import { mapLimit } from "./http";
import { computeMetrics } from "./metrics";
import { UNIVERSE, isValidTicker } from "./universe";
import { raw, yahooChart, yahooQuoteSummary, yahooQuotes, type YahooQuote } from "./yahoo";

export const REFRESH_TTL_MS = 12 * 60 * 60 * 1000;

export type EtfRow = typeof etfs.$inferSelect;

function pickSectors(arr: unknown): { sector: string; weight: number }[] {
  if (!Array.isArray(arr)) return [];
  const out: { sector: string; weight: number }[] = [];
  for (const o of arr) {
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const w = raw(v);
        if (w != null) out.push({ sector: k, weight: w });
      }
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** Fetch chart + profile for one ticker, compute metrics, persist. Returns the stored row. */
export async function refreshEtf(tickerIn: string): Promise<EtfRow> {
  const ticker = tickerIn.toUpperCase();
  if (!isValidTicker(ticker)) throw new Error("Invalid ticker");
  try {
    const [chart, qsRes] = await Promise.all([
      yahooChart(ticker, "10y", "1d"),
      yahooQuoteSummary(ticker, [
        "fundProfile",
        "summaryDetail",
        "topHoldings",
        "defaultKeyStatistics",
        "price",
      ]).catch(() => null),
    ]);
    const type = chart.meta.instrumentType;
    if (type && type !== "ETF") {
      throw new Error(`${ticker} is a ${type}, not an ETF`);
    }
    const history: HistoryJson = { t: chart.t, c: chart.c, a: chart.a, d: chart.d };
    const metrics = computeMetrics(history, chart.meta.regularMarketPrice ?? null);
    const qs = qsRes ?? {};
    const fp = qs.fundProfile ?? {};
    const sd = qs.summaryDetail ?? {};
    const dks = qs.defaultKeyStatistics ?? {};
    const th = qs.topHoldings ?? {};
    const fees = fp.feesExpensesInvestment ?? {};

    const profile: EtfProfileJson = {
      holdings: Array.isArray(th.holdings)
        ? th.holdings.map((h: { symbol?: string; holdingName?: string; holdingPercent?: unknown }) => ({
            symbol: h.symbol || null,
            name: h.holdingName ?? "",
            weight: raw(h.holdingPercent),
          }))
        : [],
      sectors: pickSectors(th.sectorWeightings),
      allocation: {
        stock: raw(th.stockPosition),
        bond: raw(th.bondPosition),
        cash: raw(th.cashPosition),
        other: raw(th.otherPosition),
      },
      reported: {
        ytdReturn: raw(dks.ytdReturn),
        threeYearAvgReturn: raw(dks.threeYearAverageReturn),
        fiveYearAvgReturn: raw(dks.fiveYearAverageReturn),
      },
    };
    const lastIdx = chart.t.length - 1;
    const row = {
      ticker,
      name: qs.price?.longName ?? chart.meta.longName ?? chart.meta.shortName ?? null,
      category: fp.categoryName ?? dks.category ?? null,
      family: fp.family ?? dks.fundFamily ?? null,
      exchange: chart.meta.fullExchangeName ?? chart.meta.exchangeName ?? null,
      instrumentType: type ?? null,
      inceptionDate: dks.fundInceptionDate?.fmt ?? null,
      expenseRatio: raw(fees.annualReportExpenseRatio),
      turnover: raw(fees.annualHoldingsTurnover),
      totalAssets: raw(dks.totalAssets) ?? raw(sd.totalAssets),
      navPrice: raw(sd.navPrice),
      reportedYield: raw(dks.yield) ?? raw(sd.yield),
      beta3y: raw(dks.beta3Year),
      lastClose: chart.meta.regularMarketPrice ?? chart.c[lastIdx] ?? null,
      lastCloseDate: lastIdx >= 0 ? new Date(chart.t[lastIdx] * 1000).toISOString().slice(0, 10) : null,
      profile,
      metrics,
      sources: {
        prices: "Yahoo Finance chart API (unofficial)",
        profile: qsRes ? "Yahoo Finance quoteSummary (unofficial)" : "unavailable",
      },
      lastError: null,
      refreshedAt: new Date(),
    };
    await db
      .insert(etfs)
      .values(row)
      .onConflictDoUpdate({ target: etfs.ticker, set: { ...row } });
    await db
      .insert(etfHistory)
      .values({ ticker, data: history, updatedAt: new Date() })
      .onConflictDoUpdate({ target: etfHistory.ticker, set: { data: history, updatedAt: new Date() } });
    return (await db.select().from(etfs).where(eq(etfs.ticker, ticker)).limit(1))[0];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Record the failure but keep any previously stored good data untouched.
    await db
      .insert(etfs)
      .values({ ticker, lastError: msg, refreshedAt: new Date() })
      .onConflictDoUpdate({ target: etfs.ticker, set: { lastError: msg } });
    throw e;
  }
}

export async function getAllEtfs(): Promise<EtfRow[]> {
  const rows = await db.select().from(etfs);
  return rows.filter((r) => r.metrics);
}

export async function getEtf(ticker: string): Promise<EtfRow | null> {
  const rows = await db.select().from(etfs).where(eq(etfs.ticker, ticker.toUpperCase())).limit(1);
  return rows[0] ?? null;
}

export async function getHistory(ticker: string): Promise<HistoryJson | null> {
  const rows = await db.select().from(etfHistory).where(eq(etfHistory.ticker, ticker.toUpperCase())).limit(1);
  return rows[0]?.data ?? null;
}

export async function getHistories(tickers: string[]): Promise<Record<string, HistoryJson>> {
  if (!tickers.length) return {};
  const rows = await db
    .select()
    .from(etfHistory)
    .where(inArray(etfHistory.ticker, tickers.map((t) => t.toUpperCase())));
  return Object.fromEntries(rows.map((r) => [r.ticker, r.data]));
}

/** Tickers in the universe that are missing or older than the TTL. */
export async function staleTickers(extra: string[] = []): Promise<string[]> {
  const rows = await db.select({ ticker: etfs.ticker, at: etfs.refreshedAt, hasMetrics: etfs.metrics, err: etfs.lastError }).from(etfs);
  // Seed universe + any ETF a user looked up that stored successfully (so ad-hoc tickers stay fresh too)
  const all = Array.from(new Set([...UNIVERSE, ...extra, ...rows.filter((r) => r.hasMetrics).map((r) => r.ticker)]));
  const map = new Map(rows.map((r) => [r.ticker, r]));
  const now = Date.now();
  return all.filter((t) => {
    const r = map.get(t);
    if (!r) return true;
    if (!r.at) return true;
    const age = now - r.at.getTime();
    // Failed tickers are retried after 6h rather than hammered every request
    if (r.err && !r.hasMetrics) return age > 6 * 60 * 60 * 1000;
    return age > REFRESH_TTL_MS;
  });
}

export async function refreshBatch(limit = 8, concurrency = 4) {
  const todo = await staleTickers();
  const batch = todo.slice(0, limit);
  const results = await mapLimit(batch, concurrency, async (t) => {
    try {
      await refreshEtf(t);
      return { ticker: t, ok: true as const };
    } catch (e) {
      return { ticker: t, ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
  const remaining = Math.max(0, todo.length - batch.length);
  return { processed: results, remaining, total: Math.max(UNIVERSE.length, todo.length) };
}

/** Live (delayed) quotes, cached 60s, stale-on-error. Returns map by symbol. */
export async function getQuotes(symbols: string[]) {
  const key = `quotes:${[...symbols].sort().join(",").slice(0, 400)}:${symbols.length}`;
  const res = await cachedOrNull(key, 60, () => yahooQuotes(symbols));
  const map = new Map<string, YahooQuote>();
  for (const q of res?.data ?? []) map.set(q.symbol, q);
  return { quotes: map, fetchedAt: res?.fetchedAt ?? null, stale: res?.stale ?? false };
}

/* ---------------- Analyst consensus (holdings-weighted) ---------------- */

export type HoldingAnalyst = {
  symbol: string;
  name: string;
  weight: number;
  price: number | null;
  targetMean: number | null;
  upside: number | null;
  recMean: number | null;
  recKey: string | null;
  analysts: number | null;
  trend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
};

async function stockAnalyst(symbol: string) {
  return cachedOrNull(`analyst:${symbol}`, 6 * 3600, async () => {
    const r = await yahooQuoteSummary(symbol, ["financialData", "recommendationTrend"]);
    const fd = r.financialData ?? {};
    const t = r.recommendationTrend?.trend?.[0];
    return {
      price: raw(fd.currentPrice),
      targetMean: raw(fd.targetMeanPrice),
      recMean: raw(fd.recommendationMean),
      recKey: (fd.recommendationKey as string | undefined) ?? null,
      analysts: raw(fd.numberOfAnalystOpinions),
      trend: t
        ? {
            strongBuy: t.strongBuy ?? 0,
            buy: t.buy ?? 0,
            hold: t.hold ?? 0,
            sell: t.sell ?? 0,
            strongSell: t.strongSell ?? 0,
          }
        : null,
    };
  });
}

export async function getHoldingsAnalystConsensus(ticker: string) {
  const row = await getEtf(ticker);
  const holdings = (row?.profile?.holdings ?? []).filter((h) => h.symbol && h.weight != null && /^[A-Z.\-]{1,6}$/.test(h.symbol));
  if (!holdings.length) return null;
  const items = await mapLimit(holdings, 4, async (h): Promise<HoldingAnalyst | null> => {
    const a = await stockAnalyst(h.symbol!);
    if (!a || (a.data.recMean == null && a.data.targetMean == null)) return null;
    const upside = a.data.targetMean != null && a.data.price ? a.data.targetMean / a.data.price - 1 : null;
    return {
      symbol: h.symbol!,
      name: h.name,
      weight: h.weight!,
      price: a.data.price,
      targetMean: a.data.targetMean,
      upside,
      recMean: a.data.recMean,
      recKey: a.data.recKey,
      analysts: a.data.analysts,
      trend: a.data.trend,
    };
  });
  const ok = items.filter((x): x is HoldingAnalyst => x != null);
  if (!ok.length) return null;
  const wRec = ok.filter((x) => x.recMean != null);
  const wUp = ok.filter((x) => x.upside != null);
  const sum = (arr: HoldingAnalyst[]) => arr.reduce((s, x) => s + x.weight, 0);
  const consensus = {
    recMean: wRec.length ? wRec.reduce((s, x) => s + x.weight * x.recMean!, 0) / sum(wRec) : null,
    upside: wUp.length ? wUp.reduce((s, x) => s + x.weight * x.upside!, 0) / sum(wUp) : null,
    coverageWeight: sum(ok),
    totalListedWeight: holdings.reduce((s, h) => s + (h.weight ?? 0), 0),
    counted: ok.length,
    listed: holdings.length,
  };
  return { items: ok, consensus };
}

/* ---------------- News ---------------- */
export { cached };
