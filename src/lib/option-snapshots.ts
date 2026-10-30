import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { optionQuoteSnapshots } from "@/db/schema";
import { bucketStart, isUsMarketHours } from "./spread";
import { generateId } from "./security";
import type { OptionContract } from "./wheel";

export type SnapshotResult = { stored: number; skipped?: string };

export function providerQuoteIsFresh(providerTimestamp: string | null | undefined, now = new Date()): boolean {
  if (!providerTimestamp) return true;
  const timestamp = Date.parse(providerTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= -60_000 && age <= 20 * 60_000;
}

export function snapshotSkipReason(fetchedAt: Date, stale: boolean, now = new Date(), marketState?: string | null, isDelayed?: boolean | null): string | null {
  if (stale) return "stale provider response";
  if (marketState != null && marketState !== "REGULAR") return `underlying market state is ${marketState}`;
  if (isDelayed === true) return "provider flagged delayed quotes";
  if (!Number.isFinite(fetchedAt.getTime())) return "missing fetch timestamp";
  if (!isUsMarketHours(fetchedAt)) return "outside regular US market hours";
  const age = now.getTime() - fetchedAt.getTime();
  if (age < -60_000) return "provider timestamp is in the future";
  if (age > 20 * 60_000) return "provider response is older than 20 minutes";
  return null;
}

/**
 * Persist a 15-minute chart sample for contracts returned by a fresh provider request.
 * We intentionally do not write cached-stale or after-hours quotes as fresh observations.
 */
export async function recordOptionQuoteSnapshots(input: {
  ticker: string;
  underlyingPrice: number;
  contracts: OptionContract[];
  fetchedAt: string | Date;
  stale?: boolean;
  marketState?: string | null;
  isDelayed?: boolean | null;
}): Promise<SnapshotResult> {
  const fetchedAt = input.fetchedAt instanceof Date ? input.fetchedAt : new Date(input.fetchedAt);
  const skipped = snapshotSkipReason(fetchedAt, !!input.stale, new Date(), input.marketState, input.isDelayed);
  if (skipped) return { stored: 0, skipped };

  const bucket = bucketStart(fetchedAt, 15);
  const capturedAt = new Date();
  const rows = input.contracts
    .filter((contract) => providerQuoteIsFresh(contract.quoteTimestamp))
    .filter((contract) => contract.bid != null || contract.ask != null || contract.iv != null)
    .map((contract) => ({
      id: generateId("oq"),
      contractSymbol: contract.symbol,
      ticker: input.ticker.toUpperCase(),
      type: contract.type,
      expiration: contract.expiration,
      strike: contract.strike,
      bucket,
      capturedAt,
      fetchedAt,
      providerTimestamp: contract.quoteTimestamp && Number.isFinite(Date.parse(contract.quoteTimestamp)) ? new Date(contract.quoteTimestamp) : null,
      source: contract.source,
      underlyingPrice: input.underlyingPrice,
      bid: contract.bid,
      ask: contract.ask,
      last: contract.last,
      iv: contract.iv,
      delta: contract.delta,
      gamma: contract.gamma ?? null,
      theta: contract.theta ?? null,
      vega: contract.vega ?? null,
      rho: contract.rho ?? null,
      openInterest: contract.oi,
      volume: contract.volume,
    }));
  if (!rows.length) return { stored: 0, skipped: "no fresh chartable quotes" };

  await db.insert(optionQuoteSnapshots).values(rows).onConflictDoNothing();
  // Keep a bounded operational history; charts request at most the latest 90 days.
  await db.delete(optionQuoteSnapshots).where(lt(optionQuoteSnapshots.capturedAt, new Date(Date.now() - 90 * 86_400_000)));
  return { stored: rows.length };
}

export async function getOptionQuoteHistory(contractSymbol: string, days = 30) {
  const boundedDays = Math.min(90, Math.max(1, Math.round(days)));
  const since = new Date(Date.now() - boundedDays * 86_400_000);
  return db
    .select({
      bucket: optionQuoteSnapshots.bucket,
      fetchedAt: optionQuoteSnapshots.fetchedAt,
      providerTimestamp: optionQuoteSnapshots.providerTimestamp,
      source: optionQuoteSnapshots.source,
      underlyingPrice: optionQuoteSnapshots.underlyingPrice,
      bid: optionQuoteSnapshots.bid,
      ask: optionQuoteSnapshots.ask,
      last: optionQuoteSnapshots.last,
      iv: optionQuoteSnapshots.iv,
      delta: optionQuoteSnapshots.delta,
      gamma: optionQuoteSnapshots.gamma,
      theta: optionQuoteSnapshots.theta,
      vega: optionQuoteSnapshots.vega,
      rho: optionQuoteSnapshots.rho,
      openInterest: optionQuoteSnapshots.openInterest,
      volume: optionQuoteSnapshots.volume,
    })
    .from(optionQuoteSnapshots)
    .where(and(eq(optionQuoteSnapshots.contractSymbol, contractSymbol), gte(optionQuoteSnapshots.bucket, since)))
    .orderBy(asc(optionQuoteSnapshots.bucket))
    .limit(4000);
}
