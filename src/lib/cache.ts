import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cacheEntries } from "@/db/schema";

export type Cached<T> = {
  data: T;
  /** ISO timestamp of when the upstream data was actually fetched */
  fetchedAt: string;
  /** true when upstream failed and an older copy is being served */
  stale: boolean;
  error?: string;
};

type MemEntry = { payload: unknown; at: number };
const g = globalThis as typeof globalThis & {
  __etfMem?: Map<string, MemEntry>;
  __etfInflight?: Map<string, Promise<Cached<unknown>>>;
};
const mem = (g.__etfMem ??= new Map());
const inflight = (g.__etfInflight ??= new Map());

/**
 * Two-level cache (memory + Postgres) with stale-on-error semantics.
 * - Fresh copy within ttlSec is returned without touching the network.
 * - If the upstream call fails and ANY previous copy exists, it is returned
 *   with stale=true so the UI can show an honest "as of" warning.
 * - If nothing exists the error propagates; the UI must show "unavailable",
 *   never a placeholder number.
 */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<Cached<T>> {
  const now = Date.now();
  const m = mem.get(key);
  if (m && now - m.at < ttlSec * 1000) {
    return { data: m.payload as T, fetchedAt: new Date(m.at).toISOString(), stale: false };
  }
  const running = inflight.get(key);
  if (running) return running as Promise<Cached<T>>;

  const p = (async (): Promise<Cached<T>> => {
    let row: { payload: unknown; fetchedAt: Date } | undefined;
    try {
      const rows = await db.select().from(cacheEntries).where(eq(cacheEntries.key, key)).limit(1);
      row = rows[0];
    } catch {
      row = undefined;
    }
    if (row && now - row.fetchedAt.getTime() < ttlSec * 1000) {
      mem.set(key, { payload: row.payload, at: row.fetchedAt.getTime() });
      return { data: row.payload as T, fetchedAt: row.fetchedAt.toISOString(), stale: false };
    }
    try {
      const data = await fn();
      const at = new Date();
      mem.set(key, { payload: data, at: at.getTime() });
      try {
        await db
          .insert(cacheEntries)
          .values({ key, payload: data as object, fetchedAt: at })
          .onConflictDoUpdate({ target: cacheEntries.key, set: { payload: data as object, fetchedAt: at } });
      } catch {
        /* cache write failure must never break a request */
      }
      return { data, fetchedAt: at.toISOString(), stale: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (row) return { data: row.payload as T, fetchedAt: row.fetchedAt.toISOString(), stale: true, error: msg };
      if (m) return { data: m.payload as T, fetchedAt: new Date(m.at).toISOString(), stale: true, error: msg };
      throw e;
    }
  })();
  inflight.set(key, p as Promise<Cached<unknown>>);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/** Convenience: returns null instead of throwing when nothing is available. */
export async function cachedOrNull<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<Cached<T> | null> {
  try {
    return await cached(key, ttlSec, fn);
  } catch {
    return null;
  }
}
