import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cacheEntries } from "@/db/schema";
import { cached } from "./cache";
import { fetchJson, HttpError, sleep } from "./http";
import { isValidTicker, UNIVERSE } from "./universe";

export const ETF_UNIVERSE_CACHE_KEY = "etf-universe:massive:v1";
export const ETF_UNIVERSE_TTL_SECONDS = 24 * 60 * 60;
export const MASSIVE_PAGE_SIZE = 1000;
export const MASSIVE_MAX_PAGES = 8;
export const MASSIVE_MIN_PAGE_INTERVAL_MS = 12_500;
export const MASSIVE_RATE_LIMIT_COOLDOWN_MS = 60_000;
const MASSIVE_BASE_URL = "https://api.polygon.io/v3/reference/tickers";
const ALLOWED_MASSIVE_HOSTS = new Set(["api.polygon.io", "api.massive.com"]);

export type DiscoveredEtf = {
  ticker: string;
  name: string | null;
  exchange: string | null;
  cik: string | null;
  providerUpdatedAt: string | null;
};

export type EtfUniverseSnapshot = {
  provider: "Polygon/Massive";
  classification: "active U.S.-listed ETFs only; type=ETF";
  pageCount: number;
  tickers: DiscoveredEtf[];
};

type MassiveTicker = {
  ticker?: unknown;
  name?: unknown;
  market?: unknown;
  locale?: unknown;
  type?: unknown;
  active?: unknown;
  primary_exchange?: unknown;
  cik?: unknown;
  last_updated_utc?: unknown;
};

type MassivePage = {
  status?: unknown;
  results?: MassiveTicker[];
  next_url?: string;
};

type CacheRead = {
  snapshot: EtfUniverseSnapshot | null;
  fetchedAt: string | null;
  stale: boolean;
};

export type EtfUniverseStatus = {
  configured: boolean;
  automatic: boolean;
  provider: "Polygon/Massive" | "Curated seed list";
  classification: string;
  discoveredCount: number;
  curatedCount: number;
  totalCount: number;
  fetchedAt: string | null;
  stale: boolean;
  pageCount: number | null;
};

export type MassiveInstrumentClass = "ETF" | "ETN" | "other";

/** Keep exchange-traded notes distinct from funds even if a provider response is broader than requested. */
export function classifyMassiveInstrument(row: MassiveTicker): MassiveInstrumentClass {
  if (row.market !== "stocks" || row.locale !== "us" || row.active !== true) return "other";
  if (row.type === "ETF") return "ETF";
  if (row.type === "ETN") return "ETN";
  return "other";
}

export function normalizeMassiveEtfs(rows: MassiveTicker[]): DiscoveredEtf[] {
  const byTicker = new Map<string, DiscoveredEtf>();
  for (const row of rows) {
    if (classifyMassiveInstrument(row) !== "ETF") continue;
    if (typeof row.ticker !== "string") continue;
    const ticker = row.ticker.trim().toUpperCase();
    if (!isValidTicker(ticker)) continue;
    byTicker.set(ticker, {
      ticker,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
      exchange: typeof row.primary_exchange === "string" && row.primary_exchange.trim() ? row.primary_exchange.trim() : null,
      cik: typeof row.cik === "string" || typeof row.cik === "number" ? String(row.cik) : null,
      providerUpdatedAt: typeof row.last_updated_utc === "string" ? row.last_updated_utc : null,
    });
  }
  return [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function validateSnapshot(value: unknown): value is EtfUniverseSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<EtfUniverseSnapshot>;
  return data.provider === "Polygon/Massive" && Array.isArray(data.tickers) && typeof data.pageCount === "number";
}

async function readCachedSnapshot(): Promise<CacheRead> {
  const rows = await db.select({ payload: cacheEntries.payload, fetchedAt: cacheEntries.fetchedAt })
    .from(cacheEntries)
    .where(eq(cacheEntries.key, ETF_UNIVERSE_CACHE_KEY))
    .limit(1);
  const row = rows[0];
  if (!row || !validateSnapshot(row.payload)) return { snapshot: null, fetchedAt: row?.fetchedAt.toISOString() ?? null, stale: false };
  const fetchedAt = row.fetchedAt.toISOString();
  return {
    snapshot: row.payload,
    fetchedAt,
    stale: Date.now() - row.fetchedAt.getTime() >= ETF_UNIVERSE_TTL_SECONDS * 1000,
  };
}

function buildFirstPageUrl(apiKey: string): URL {
  const url = new URL(MASSIVE_BASE_URL);
  url.searchParams.set("market", "stocks");
  url.searchParams.set("locale", "us");
  url.searchParams.set("type", "ETF");
  url.searchParams.set("active", "true");
  url.searchParams.set("sort", "ticker");
  url.searchParams.set("order", "asc");
  url.searchParams.set("limit", String(MASSIVE_PAGE_SIZE));
  url.searchParams.set("apiKey", apiKey);
  return url;
}

async function fetchMassivePage(url: URL): Promise<MassivePage> {
  if (url.protocol !== "https:" || !ALLOWED_MASSIVE_HOSTS.has(url.hostname)) {
    throw new Error("Massive ETF listing returned an unexpected pagination host");
  }
  const page = await fetchJson<MassivePage>(url.toString(), { timeoutMs: 15_000, retries: 0 });
  if (page.status !== "OK" || !Array.isArray(page.results)) {
    throw new Error("Massive ETF listing returned an invalid response");
  }
  return page;
}

/** Fetch a complete, bounded provider listing. Partial pages are never published as a full snapshot. */
export async function fetchMassiveEtfUniverse(
  apiKey: string,
  options: {
    fetchPage?: (url: URL) => Promise<MassivePage>;
    wait?: (ms: number) => Promise<unknown>;
    pageIntervalMs?: number;
    maxPages?: number;
  } = {},
): Promise<EtfUniverseSnapshot> {
  if (!apiKey.trim()) throw new Error("POLYGON_API_KEY is required for ETF universe discovery");
  const fetchPage = options.fetchPage ?? fetchMassivePage;
  const wait = options.wait ?? sleep;
  const pageIntervalMs = options.pageIntervalMs ?? MASSIVE_MIN_PAGE_INTERVAL_MS;
  const maxPages = options.maxPages ?? MASSIVE_MAX_PAGES;
  let nextUrl: URL | null = buildFirstPageUrl(apiKey);
  const allRows: MassiveTicker[] = [];
  let pageCount = 0;
  let rateLimitRetryUsed = false;
  const fetchPageWithBackoff = async (url: URL) => {
    try {
      return await fetchPage(url);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 429 || rateLimitRetryUsed) throw error;
      rateLimitRetryUsed = true;
      await wait(MASSIVE_RATE_LIMIT_COOLDOWN_MS);
      return fetchPage(url);
    }
  };

  while (nextUrl) {
    if (pageCount >= maxPages) throw new Error(`ETF universe exceeded the ${maxPages}-page safety limit; no partial snapshot was saved`);
    if (pageCount > 0) await wait(pageIntervalMs);
    const page = await fetchPageWithBackoff(nextUrl);
    pageCount++;
    allRows.push(...(page.results ?? []));
    if (!page.next_url) {
      nextUrl = null;
      continue;
    }

    const following = new URL(page.next_url);
    if (following.protocol !== "https:" || !ALLOWED_MASSIVE_HOSTS.has(following.hostname)) {
      throw new Error("Massive ETF listing returned an unexpected pagination host");
    }
    following.searchParams.set("apiKey", apiKey);
    nextUrl = following;
  }

  const tickers = normalizeMassiveEtfs(allRows);
  if (!tickers.length) throw new Error("Massive ETF listing contained no active U.S.-listed ETFs; previous snapshot was kept");
  return {
    provider: "Polygon/Massive",
    classification: "active U.S.-listed ETFs only; type=ETF",
    pageCount,
    tickers,
  };
}

export async function refreshEtfUniverse(force = false) {
  const apiKey = process.env.POLYGON_API_KEY?.trim();
  if (!apiKey) throw new Error("Configure POLYGON_API_KEY to discover the full active U.S.-listed ETF universe");
  return cached(
    ETF_UNIVERSE_CACHE_KEY,
    force ? 0 : ETF_UNIVERSE_TTL_SECONDS,
    () => fetchMassiveEtfUniverse(apiKey),
  );
}

export function automaticEtfDiscoveryEnabled(): boolean {
  const flag = process.env.ETF_UNIVERSE_DISCOVERY;
  if (flag === "false") return false;
  if (!process.env.POLYGON_API_KEY?.trim()) return false;
  if (flag === "true") return true;
  return process.env.NODE_ENV === "production";
}

export async function getEffectiveEtfUniverse(): Promise<{ tickers: string[]; status: EtfUniverseStatus }> {
  const cachedSnapshot = await readCachedSnapshot();
  const discovered = cachedSnapshot.snapshot?.tickers ?? [];
  const tickers = [...new Set([...UNIVERSE, ...discovered.map((item) => item.ticker)])].sort((a, b) => a.localeCompare(b));
  const configured = Boolean(process.env.POLYGON_API_KEY?.trim());
  const status: EtfUniverseStatus = {
    configured,
    automatic: automaticEtfDiscoveryEnabled(),
    provider: cachedSnapshot.snapshot ? "Polygon/Massive" : "Curated seed list",
    classification: "Active U.S.-listed ETFs only. Leveraged/inverse ETFs remain tagged by existing risk rules; vendor-classified ETNs are kept separate and excluded, as are mutual funds.",
    discoveredCount: discovered.length,
    curatedCount: UNIVERSE.length,
    totalCount: tickers.length,
    fetchedAt: cachedSnapshot.fetchedAt,
    stale: cachedSnapshot.stale,
    pageCount: cachedSnapshot.snapshot?.pageCount ?? null,
  };
  return { tickers, status };
}

export async function getEtfUniverseStatus(): Promise<EtfUniverseStatus> {
  return (await getEffectiveEtfUniverse()).status;
}
