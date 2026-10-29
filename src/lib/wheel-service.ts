import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { wheelIvHistory, wheelScans } from "@/db/schema";
import { getOptionChain } from "./options-providers";
import { isUsMarketHours } from "./spread";
import { mapLimit } from "./http";
import { getAllStocks, gradeStock, refreshStockBatch, staleStocks, type GradedStock } from "./stock-service";
import { stockGradeRank, type StockGrade } from "./stock-quality";
import { yahooQuotes } from "./yahoo";
import { DEFAULT_PARAMS, daysBetween, scanPuts, type OptionContract, type PutCandidate, type RejectReason, type StockCtx, type WheelParams } from "./wheel";
import { generateId } from "./security";
import { ivPercentile } from "./wheel-iv";
import { recordOptionQuoteSnapshots } from "./option-snapshots";
import { evaluateStockThresholds, STOCK_PRESETS, type MissingPolicy } from "./stock-presets";
import type { PresetKey, StockThresholds } from "./stock-presets";
import type { StockInputs } from "./stock-quality";

/** Chains are scanned only for stocks graded at least this well. Broadened to C for transparent presets. */
export const SCAN_MIN_GRADE: StockGrade = "C";
const SCAN_TTL_MARKET_MS = 20 * 60 * 1000;
const SCAN_TTL_CLOSED_MS = 4 * 60 * 60 * 1000;
/** Loose window stored per stock; the page applies the user's own (tighter) filters on top. */
const SCAN_DTE_MIN = 7;
const SCAN_DTE_MAX = 70;

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function stockCtx(g: GradedStock, price: number | null): StockCtx | null {
  const p = price ?? g.row.price;
  const t = g.row.technicals;
  if (p == null || !t) return null;
  const ev = g.row.events;
  return {
    ticker: g.row.ticker,
    price: p,
    nextEarnings: ev?.nextEarnings ?? null,
    earningsEstimated: ev?.earningsEstimated ?? false,
    exDividend: ev?.exDividend ?? null,
    dividendPerShare: ev?.dividendPerShare ?? null,
    dividendYield: ev?.dividendYield ?? null,
    beta: g.row.fundamentals?.beta ?? null,
    hv30: t.hv30,
    sma200: t.sma200,
    supports: t.supports.map((l) => l.price),
  };
}

export function scanIsStale(scannedAt: Date | null | undefined, now = new Date()): boolean {
  if (!scannedAt) return true;
  return now.getTime() - scannedAt.getTime() > (isUsMarketHours(now) ? SCAN_TTL_MARKET_MS : SCAN_TTL_CLOSED_MS);
}

async function scanOne(g: GradedStock, price: number | null, marketState?: string | null) {
  const ticker = g.row.ticker;
  const p = price ?? g.row.price;
  try {
    if (p == null) throw new Error("no price");
    const r = await getOptionChain({ symbol: ticker, type: "put", price: p, dteMin: SCAN_DTE_MIN, dteMax: SCAN_DTE_MAX, divYield: g.row.events?.dividendYield ?? 0 });
    await recordOptionQuoteSnapshots({ ticker, underlyingPrice: p, contracts: r.contracts.slice(0, 120), fetchedAt: r.fetchedAt, stale: r.stale, marketState }).catch((e) => {
      console.warn("[options] background quote snapshot skipped:", e instanceof Error ? e.message : e);
    });
    const contracts = r.contracts.filter((c) => c.delta != null && Math.abs(c.delta) <= 0.5 && (c.bid ?? 0) > 0);
    const row = { ticker, scannedAt: new Date(), source: r.source, fallbackReason: r.fallbackReason, price: p, contracts, error: null };
    await db.insert(wheelScans).values(row).onConflictDoUpdate({ target: wheelScans.ticker, set: row });
    // Sprint C: persist IV snapshot for rank (best-effort, non-blocking)
    try {
      const hv = g.row.technicals?.hv30 ?? null;
      const now = new Date();
      const ivRows = contracts.slice(0, 15).map((c) => ({
        id: generateId("iv"),
        ticker,
        capturedAt: now,
        expiration: c.expiration,
        strike: c.strike,
        iv: c.iv,
        hv30: hv,
        dte: c.expiration ? Math.round((Date.parse(c.expiration) - Date.now()) / 86_400_000) : null,
      }));
      if (ivRows.length) await db.insert(wheelIvHistory).values(ivRows as unknown as typeof wheelIvHistory.$inferInsert[]);
      // prune old entries beyond 1 year to bound table (fire-and-forget)
      // keep last ~500 per ticker max — cleanup can be via scheduled job; omitted for brevity
    } catch {
      /* IV history is advisory */
    }
    return { ticker, ok: true as const };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Clear old contracts on failure: showing stale quotes as current would be misleading. Retried after the TTL.
    const row = { ticker, scannedAt: new Date(), source: null, fallbackReason: null, price: p, contracts: null, error };
    await db.insert(wheelScans).values(row).onConflictDoUpdate({ target: wheelScans.ticker, set: row });
    return { ticker, ok: false as const, error };
  }
}

/** IV rank for a set of tickers: median IV of current chain vs its 1y history. */
export async function getIvRanks(tickers: string[]): Promise<Map<string, number | null>> {
  if (!tickers.length) return new Map();
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()))];
  try {
    const rows = await db.select({ ticker: wheelIvHistory.ticker, iv: wheelIvHistory.iv }).from(wheelIvHistory).where(inArray(wheelIvHistory.ticker, uniq));
    const byTicker = new Map<string, number[]>();
    for (const r of rows) if (r.iv != null && Number.isFinite(r.iv)) (byTicker.get(r.ticker) ?? byTicker.set(r.ticker, []).get(r.ticker)!).push(r.iv);
    // Current median per ticker from latest scan (we have scan table, but reuse history tail: median of recent 5 snapshots)
    const scans = await db.select({ ticker: wheelScans.ticker, contracts: wheelScans.contracts }).from(wheelScans).where(inArray(wheelScans.ticker, uniq));
    const out = new Map<string, number | null>();
    for (const s of scans) {
      const hist = byTicker.get(s.ticker) ?? [];
      if (!hist.length || !s.contracts) { out.set(s.ticker, null); continue; }
      const curIvs = (s.contracts as OptionContract[]).map((c) => c.iv).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
      const curMedian = curIvs.length ? curIvs[Math.floor(curIvs.length / 2)] : null;
      out.set(s.ticker, ivPercentile(hist, curMedian));
    }
    return out;
  } catch {
    return new Map();
  }
}

async function eligibleStocks(): Promise<GradedStock[]> {
  return (await getAllStocks())
    .map(gradeStock)
    .filter((g) => g.grade != null && stockGradeRank(g.grade) <= stockGradeRank(SCAN_MIN_GRADE));
}

export async function staleScanTickers(): Promise<GradedStock[]> {
  const [elig, scans] = await Promise.all([eligibleStocks(), db.select({ t: wheelScans.ticker, at: wheelScans.scannedAt }).from(wheelScans)]);
  const at = new Map(scans.map((s) => [s.t, s.at]));
  return elig.filter((g) => scanIsStale(at.get(g.row.ticker)));
}

/** Scan up to `limit` stale C+ stocks (live prices first, stored price as fallback). */
export async function runScanBatch(limit: number, concurrency = 3) {
  const stale = await staleScanTickers();
  const batch = stale.slice(0, limit);
  const quoteByTicker = new Map<string, { price: number | null; marketState: string | null }>();
  try {
    for (const quote of await yahooQuotes(batch.map((b) => b.row.ticker))) {
      quoteByTicker.set(quote.symbol, { price: quote.price, marketState: quote.marketState ?? null });
    }
  } catch {
    /* fall back to the stored daily close */
  }
  const processed = await mapLimit(batch, concurrency, (g) => {
    const quote = quoteByTicker.get(g.row.ticker);
    return scanOne(g, quote?.price ?? null, quote?.marketState ?? null);
  });
  return { processed, remaining: Math.max(0, stale.length - batch.length) };
}

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export type AccountFilter = "all" | "R" | "T";
export type GradeMatch = "minimum" | "exact";
export type WheelSort = "score" | "annRoc";
export type WheelFilters = {
  params: WheelParams;
  minGrade: "A+" | "A" | "B" | "C" | "all";
  gradeMatch: GradeMatch;
  sortBy: WheelSort;
  stockMode: "preset" | "custom";
  stockPreset: PresetKey;
  stockThresholds: StockThresholds;
  optionableOnly: boolean;
  missingPolicy: MissingPolicy;
  account: AccountFilter;
  trendOnly: boolean;
  minScore: number;
  divOnly: boolean;
  /** Maximum cash-secured collateral allowed for the selected put, per contract. */
  maxCollateral: number | null;
  /** Optional provider-backed stock sector filter. */
  sector: string | null;
};

export function matchesWheelGrade(grade: StockGrade | null, filter: WheelFilters["minGrade"], mode: GradeMatch): boolean {
  if (grade == null) return false;
  if (filter === "all") return true;
  if (mode === "exact") return grade === filter;
  // Minimum grade is inclusive: B includes B, A, and A+.
  return stockGradeRank(grade) <= stockGradeRank(filter as StockGrade);
}

export function comparePutCandidates(a: Pick<PutCandidate, "annRoc" | "score">, b: Pick<PutCandidate, "annRoc" | "score">, sortBy: WheelSort): number {
  return sortBy === "annRoc"
    ? b.annRoc - a.annRoc || b.score - a.score
    : b.score - a.score || b.annRoc - a.annRoc;
}

/** Keep affordable alternatives in the ranking pool before selecting a ticker's best contract. */
export function filterCandidatesByCollateral<T extends { cash: number }>(candidates: T[], maxCollateral: number | null): T[] {
  return maxCollateral == null ? candidates : candidates.filter((candidate) => candidate.cash <= maxCollateral);
}

export const DEFAULT_FILTERS: WheelFilters = {
  params: DEFAULT_PARAMS,
  minGrade: "A",
  gradeMatch: "minimum",
  sortBy: "score",
  stockMode: "preset",
  stockPreset: "A",
  stockThresholds: STOCK_PRESETS["A"],
  optionableOnly: true,
  missingPolicy: "exclude",
  account: "all",
  trendOnly: false,
  minScore: 15,
  divOnly: false,
  maxCollateral: null,
  sector: null,
};

export type WheelRow = {
  g: GradedStock;
  ctx: StockCtx;
  best: PutCandidate;
  count: number;
  source: string | null;
  fallbackReason: string | null;
  scannedAt: Date;
  stale: boolean;
};
export type EarningsWatchRow = { g: GradedStock; ctx: StockCtx; days: number; estimated: boolean };

export type WheelResults = {
  rows: WheelRow[];
  /** Available provider-backed stock sectors, before candidate filters. */
  sectors: string[];
  /** Stocks with a qualifying put only if expiries after earnings are allowed. */
  heldBackByEarnings: { ticker: string; days: number | null }[];
  earningsWatch: EarningsWatchRow[];
  rejected: Partial<Record<RejectReason, number>>;
  info: { eligible: number; scanned: number; failed: { ticker: string; error: string }[]; waiting: number; oldest: Date | null; sources: Record<string, number>; fallbacks: number; universe: number; hydrated: number; staleStocks: number; missingFields: number; missingDropped: number };
};

export async function getWheelResults(f: WheelFilters = DEFAULT_FILTERS, today = todayIso()): Promise<WheelResults> {
  const [all, scans, stale] = await Promise.all([getAllStocks(), db.select().from(wheelScans), staleStocks()]);
  const graded = all.map(gradeStock);
  let eligible: typeof graded;
  let missingFields = 0;
  let missingDropped = 0;
  if (f.stockMode === "custom") {
    eligible = [];
    for (const g of graded) {
      if (f.optionableOnly === false) {
        eligible.push(g);
        continue;
      }
      const ev = evaluateStockThresholds(g.row.fundamentals as StockInputs | null, f.stockThresholds, f.missingPolicy);
      if (ev.missing.length) missingFields++;
      if (ev.pass) {
        eligible.push(g);
      } else if (f.missingPolicy === "exclude" && ev.missing.length) {
        const kept = evaluateStockThresholds(g.row.fundamentals as StockInputs | null, f.stockThresholds, "keep");
        if (kept.pass) missingDropped++;
      }
    }
  } else {
    eligible = graded.filter((g) => matchesWheelGrade(g.grade, f.minGrade, f.gradeMatch));
    // optionableOnly also applies in preset mode
    if (f.optionableOnly === false) {
      // no-op today, reserved
    }
  }
  const sectors = [...new Set(graded
    .map((g) => g.row.sector?.trim())
    .filter((sector): sector is string => Boolean(sector)))].sort((a, b) => a.localeCompare(b));
  if (f.sector) {
    const selectedSector = f.sector.trim().toLocaleLowerCase("en-US");
    eligible = eligible.filter((g) => g.row.sector?.trim().toLocaleLowerCase("en-US") === selectedSector);
  }

  const scanBy = new Map(scans.map((s) => [s.ticker, s]));

  const rows: WheelRow[] = [];
  const held: WheelResults["heldBackByEarnings"] = [];
  const earningsWatch: EarningsWatchRow[] = [];
  const rejected: WheelResults["rejected"] = {};
  const failed: { ticker: string; error: string }[] = [];
  const sources: Record<string, number> = {};
  let scanned = 0;
  let fallbacks = 0;
  let oldest: Date | null = null;

  for (const g of eligible) {
    const s = scanBy.get(g.row.ticker);
    const ctx = stockCtx(g, s?.price ?? null);
    if (!ctx) continue;
    if (ctx.nextEarnings && ctx.nextEarnings >= today && daysBetween(today, ctx.nextEarnings) <= 21) {
      earningsWatch.push({ g, ctx, days: daysBetween(today, ctx.nextEarnings), estimated: ctx.earningsEstimated });
    }
    if (!s) continue;
    if (s.error || !s.contracts) {
      failed.push({ ticker: g.row.ticker, error: s.error ?? "no contracts" });
      continue;
    }
    scanned++;
    if (!oldest || s.scannedAt < oldest) oldest = s.scannedAt;
    sources[s.source ?? "?"] = (sources[s.source ?? "?"] ?? 0) + 1;
    if (s.fallbackReason) fallbacks++;
    if (f.trendOnly && ctx.sma200 != null && ctx.price < ctx.sma200) continue;
    // Dividend-only filter: keep only stocks with a meaningful dividend inside the expiry window
    if (f.divOnly && !(ctx.dividendYield != null && ctx.dividendYield > 0.005)) continue;

    const scan = scanPuts(s.contracts as OptionContract[], ctx, f.params, today);
    for (const [k, n] of Object.entries(scan.rejected)) rejected[k as RejectReason] = (rejected[k as RejectReason] ?? 0) + (n ?? 0);
    let cands = filterCandidatesByCollateral(scan.candidates, f.maxCollateral);
    if (f.minScore != null && Number.isFinite(f.minScore) && f.minScore > 0) {
      cands = cands.filter((c) => c.score >= f.minScore);
    }
    if (f.account !== "all") cands = cands.filter((c) => c.account.flag === f.account || c.account.flag === "R/T");
    cands.sort((a, b) => comparePutCandidates(a, b, f.sortBy));
    if (cands.length === 0) {
      if (!f.params.allowEarnings && !scan.candidates.length && (scan.rejected.earnings ?? 0) > 0) {
        const without = scanPuts(s.contracts as OptionContract[], ctx, { ...f.params, allowEarnings: true }, today);
        if (without.candidates.length) held.push({ ticker: g.row.ticker, days: ctx.nextEarnings ? daysBetween(today, ctx.nextEarnings) : null });
      }
      continue;
    }
    rows.push({ g, ctx, best: cands[0], count: cands.length, source: s.source, fallbackReason: s.fallbackReason, scannedAt: s.scannedAt, stale: scanIsStale(s.scannedAt) });
  }
  rows.sort((a, b) => comparePutCandidates(a.best, b.best, f.sortBy));
  earningsWatch.sort((a, b) => a.days - b.days);
  const universe = stale.length;
  return {
    rows,
    sectors,
    heldBackByEarnings: held,
    earningsWatch,
    rejected,
    info: { eligible: eligible.length, scanned, failed, waiting: eligible.length - scanned - failed.length, oldest, sources, fallbacks, universe: all.length, hydrated: all.length, staleStocks: universe, missingFields, missingDropped },
  };
}

export { refreshStockBatch };

/* ------------------------------------------------------------------ */
/* Background scanner                                                   */
/* ------------------------------------------------------------------ */

const g = globalThis as typeof globalThis & { __wheelScanner?: boolean };

/** Keeps stock data and option scans fresh while the server runs (production default; WHEEL_SCANNER=true/false overrides). */
export function startWheelScanner() {
  const flag = process.env.WHEEL_SCANNER;
  const on = flag ? flag === "true" : process.env.NODE_ENV === "production";
  if (!on || g.__wheelScanner) return;
  g.__wheelScanner = true;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await refreshStockBatch(12, 4);
      if (r.remaining === 0) await runScanBatch(30, 3);
    } catch (e) {
      console.error("[wheel] background scan failed:", e instanceof Error ? e.message : e);
    } finally {
      busy = false;
    }
  };
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), 2 * 60 * 1000).unref?.();
  }, 90_000).unref?.();
}

export async function getScan(ticker: string) {
  return (await db.select().from(wheelScans).where(eq(wheelScans.ticker, ticker.toUpperCase())).limit(1))[0] ?? null;
}
