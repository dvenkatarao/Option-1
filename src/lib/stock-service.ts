import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stocks } from "@/db/schema";
import { mapLimit } from "./http";
import { parseStockSummary } from "./stock-parse";
import { computeStockQuality, type StockGrade, type StockQuality } from "./stock-quality";
import { stockUniverse } from "./stock-universe";
import { computeTechnicals } from "./technicals";
import { isValidTicker } from "./universe";
import { yahooBars, yahooQuoteSummary } from "./yahoo";

export const STOCK_TTL_MS = 12 * 60 * 60 * 1000;
export type StockRow = typeof stocks.$inferSelect;

const MODULES = ["financialData", "defaultKeyStatistics", "summaryDetail", "calendarEvents", "price", "assetProfile"];

/** Fetch bars + fundamentals for one stock, compute technicals, persist. Keeps the previous good row when the fetch fails. */
export async function refreshStock(tickerIn: string): Promise<StockRow> {
  const ticker = tickerIn.toUpperCase();
  if (!isValidTicker(ticker)) throw new Error("Invalid ticker");
  try {
    const [{ bars, price }, qs] = await Promise.all([yahooBars(ticker, "2y"), yahooQuoteSummary(ticker, MODULES)]);
    const tech = computeTechnicals(bars);
    const parsed = parseStockSummary(qs, tech);
    if (tech == null && price != null) parsed.fundamentals.price = price;
    const row = {
      ticker,
      name: parsed.name,
      sector: parsed.sector,
      industry: parsed.industry,
      marketCap: parsed.marketCap,
      price: parsed.fundamentals.price,
      priceAt: new Date(),
      fundamentals: parsed.fundamentals,
      events: parsed.events,
      technicals: tech,
      lastError: null,
      refreshedAt: new Date(),
    };
    await db.insert(stocks).values(row).onConflictDoUpdate({ target: stocks.ticker, set: row });
    return (await db.select().from(stocks).where(eq(stocks.ticker, ticker)).limit(1))[0];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.insert(stocks).values({ ticker, lastError: msg, refreshedAt: new Date() }).onConflictDoUpdate({ target: stocks.ticker, set: { lastError: msg, refreshedAt: new Date() } });
    throw e;
  }
}

export async function getAllStocks(): Promise<StockRow[]> {
  const rows = await db.select().from(stocks);
  return rows.filter((r) => r.fundamentals && r.technicals);
}

export async function getStock(ticker: string): Promise<StockRow | null> {
  return (await db.select().from(stocks).where(eq(stocks.ticker, ticker.toUpperCase())).limit(1))[0] ?? null;
}

/** Universe tickers that are missing or older than the TTL (failed ones are retried after the TTL, not in a loop). */
export async function staleStocks(now = Date.now()): Promise<string[]> {
  const rows = await db.select({ t: stocks.ticker, at: stocks.refreshedAt }).from(stocks);
  const at = new Map(rows.map((r) => [r.t, r.at?.getTime() ?? 0]));
  return stockUniverse().filter((t) => now - (at.get(t) ?? 0) > STOCK_TTL_MS);
}

export async function refreshStockBatch(limit: number, concurrency = 4) {
  const stale = await staleStocks();
  const batch = stale.slice(0, limit);
  const processed = await mapLimit(batch, concurrency, async (t) => {
    try {
      await refreshStock(t);
      return { ticker: t, ok: true as const };
    } catch (e) {
      return { ticker: t, ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return { processed, remaining: Math.max(0, stale.length - batch.length), total: stockUniverse().length };
}

export type GradedStock = { row: StockRow; quality: StockQuality; grade: StockGrade | null };
export function gradeStock(row: StockRow): GradedStock {
  const quality = computeStockQuality(row.fundamentals!);
  return { row, quality, grade: quality.grade };
}
