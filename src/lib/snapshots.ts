import { eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { etfs, quoteSnapshots } from "@/db/schema";
import { cachedOrNull } from "./cache";
import { MAX_REL_SPREAD, SPREAD_MIN_DAYS, SPREAD_MIN_SAMPLES, bucketStart, isUsMarketHours, type SpreadStat } from "./spread";
import { yahooQuotes, type YahooQuote } from "./yahoo";

const RETENTION_DAYS = 120;
const TICK_MS = 5 * 60_000;

export type CaptureResult = { stored: number; skipped?: string };

/**
 * Saves one quote sample per ticker for the current 30-minute bucket, only during regular US market hours
 * and only for quotes the provider reports as REGULAR (so holidays and pre/post-market are skipped).
 * Safe to call from several instances: the (ticker, bucket) primary key makes duplicates a no-op.
 */
export async function captureQuoteSnapshots(
  opts: { now?: Date; fetchQuotes?: (symbols: string[]) => Promise<YahooQuote[]> } = {},
): Promise<CaptureResult> {
  const now = opts.now ?? new Date();
  if (!isUsMarketHours(now)) return { stored: 0, skipped: "outside market hours" };
  const bucket = bucketStart(now);

  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(quoteSnapshots).where(eq(quoteSnapshots.bucket, bucket));
  if (c > 0) return { stored: 0, skipped: "bucket already captured" };

  const tickers = (await db.select({ t: etfs.ticker }).from(etfs).where(isNotNull(etfs.metrics))).map((r) => r.t);
  if (!tickers.length) return { stored: 0, skipped: "no ETFs loaded yet" };

  const quotes = await (opts.fetchQuotes ?? yahooQuotes)(tickers);
  const rows = quotes
    .filter((q) => q.marketState === "REGULAR")
    .map((q) => ({
      ticker: q.symbol,
      bucket,
      capturedAt: now,
      price: q.price,
      volume: q.volume,
      bid: q.bid ?? null,
      ask: q.ask ?? null,
      marketState: q.marketState ?? null,
    }));
  if (!rows.length) return { stored: 0, skipped: "market not in regular session" };

  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(quoteSnapshots).values(rows.slice(i, i + 500)).onConflictDoNothing();
  }
  await db.delete(quoteSnapshots).where(lt(quoteSnapshots.capturedAt, new Date(now.getTime() - RETENTION_DAYS * 86400000)));
  return { stored: rows.length };
}

type SpreadRow = { ticker: string; n: number; days: number; median: number | null };

/** Median relative spread per ticker over the last 60 days (valid samples only). Cached 10 minutes. */
export async function getSpreadStats(): Promise<Map<string, SpreadStat>> {
  const res = await cachedOrNull<Record<string, SpreadStat>>("spread:stats:v1", 600, async () => {
    const r = await db.execute(sql`
      select ticker,
             count(*)::int as n,
             count(distinct (captured_at at time zone 'America/New_York')::date)::int as days,
             percentile_cont(0.5) within group (order by (ask - bid) / ((ask + bid) / 2)) as median
      from quote_snapshots
      where captured_at > now() - interval '60 days'
        and bid > 0 and ask >= bid
        and (ask - bid) / ((ask + bid) / 2) <= ${MAX_REL_SPREAD}
      group by ticker`);
    const out: Record<string, SpreadStat> = {};
    for (const row of r.rows as SpreadRow[]) if (row.median != null) out[row.ticker] = { median: Number(row.median), n: Number(row.n), days: Number(row.days) };
    return out;
  });
  return new Map(Object.entries(res?.data ?? {}));
}

/** Overall snapshot-history summary for the Coverage page. */
export async function getSnapshotSummary() {
  const r = await db.execute(sql`
    select count(*)::int as samples,
           count(distinct ticker)::int as tickers,
           count(distinct (captured_at at time zone 'America/New_York')::date)::int as days,
           min(captured_at) as first, max(captured_at) as last
    from quote_snapshots`);
  const row = (r.rows[0] ?? {}) as { samples?: number; tickers?: number; days?: number; first?: Date | null; last?: Date | null };
  return {
    samples: Number(row.samples ?? 0),
    tickers: Number(row.tickers ?? 0),
    days: Number(row.days ?? 0),
    first: row.first ? new Date(row.first).toISOString() : null,
    last: row.last ? new Date(row.last).toISOString() : null,
    minSamples: SPREAD_MIN_SAMPLES,
    minDays: SPREAD_MIN_DAYS,
  };
}

const g = globalThis as typeof globalThis & { __etfSnapshotTimer?: ReturnType<typeof setInterval> };

/**
 * Starts the in-process sampler (called once at server start from instrumentation.ts).
 * On by default in production; QUOTE_SNAPSHOTS=false disables it, QUOTE_SNAPSHOTS=true enables it in development.
 */
export function startQuoteSnapshotter() {
  const flag = process.env.QUOTE_SNAPSHOTS;
  if (flag === "false" || (flag !== "true" && process.env.NODE_ENV !== "production")) return;
  if (g.__etfSnapshotTimer) return;
  const tick = async () => {
    try {
      const r = await captureQuoteSnapshots();
      if (r.stored > 0) console.log(`[snapshots] stored ${r.stored} quote samples`);
    } catch (e) {
      console.error("[snapshots] capture failed:", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(tick, 60_000).unref();
  g.__etfSnapshotTimer = setInterval(tick, TICK_MS);
  g.__etfSnapshotTimer.unref();
}
