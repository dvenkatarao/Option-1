"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Database,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { ScreenRow } from "../../types/liveScreener";
import { filterLiveEtfs, sortLiveEtfs, type LiveErosionFilter, type LiveSortDirection, type LiveSortKey } from "../../lib/live-etf-screener";
import { LiveEtfDetailModal } from "./LiveEtfDetailModal";

type EtfUniverseStatus = {
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

type ScreenerResponse = {
  rows: ScreenRow[];
  categories: string[];
  count: number;
  hydrated: number;
  totalUniverse: number;
  universe: EtfUniverseStatus;
  remaining: number;
  refreshedAt: string | null;
  stale: boolean;
  riskFreeRate: number | null;
  riskFreeDate: string | null;
};

type SortHeaderProps = {
  label: string;
  sortKey: LiveSortKey;
  current: LiveSortKey;
  direction: LiveSortDirection;
  onSort: (key: LiveSortKey) => void;
  className?: string;
};

const pct = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(digits)}%`;
const money = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const aum = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return money(value, 0);
};
const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";
const dateLabel = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString() : "N/A";
const changeLabel = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${response.status})`);
  return data as T;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold text-slate-100">{value}</div>
      {hint && <div className="mt-1 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function SortHeader({ label, sortKey, current, direction, onSort, className = "" }: SortHeaderProps) {
  const Icon = current !== sortKey ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  const alignRight = className.includes("text-right");
  return (
    <th className={`select-none border-b border-slate-800 px-3 py-3 font-semibold ${className}`}>
      <button type="button" onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1.5 whitespace-nowrap transition hover:text-emerald-300 ${alignRight ? "w-full justify-end" : ""}`} aria-label={`Sort by ${label}`}>
        <span>{label}</span><Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function QualityBadge({ row }: { row: ScreenRow }) {
  if (!row.quality) return <span className="text-slate-500">N/A</span>;
  const tone = row.quality === "A" || row.quality === "B" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : row.quality === "C" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return <span title="Rules-based product quality grade, not a Morningstar rating" className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[11px] font-bold ${tone}`}>{row.quality}{row.qualityScore == null ? "" : ` · ${row.qualityScore.toFixed(0)}`}</span>;
}

function ErosionBadge({ value }: { value: string }) {
  const tone = value === "None" || value === "Mild"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : value === "Moderate"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : value === "Severe"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
        : "border-slate-700 bg-slate-950 text-slate-400";
  const Icon = value === "None" || value === "Mild" ? ShieldCheck : ShieldAlert;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold ${tone}`}><Icon className="h-3 w-3" />{value === "n/a" ? "N/A" : value}</span>;
}

function CompareModal({ rows, onClose }: { rows: ScreenRow[]; onClose: () => void }) {
  const fields: { label: string; value: (row: ScreenRow) => string }[] = [
    { label: "Provider category", value: (row) => row.category ?? "N/A" },
    { label: "Quality grade", value: (row) => row.quality ? `${row.quality}${row.qualityScore == null ? "" : ` · ${row.qualityScore.toFixed(0)}`}` : "N/A" },
    { label: "Price", value: (row) => money(row.price) },
    { label: "Day change", value: (row) => changeLabel(row.changePct) },
    { label: "TTM yield", value: (row) => pct(row.yieldTtm) },
    { label: "Last ex-date", value: (row) => dateLabel(row.lastExDate) },
    { label: "5Y distribution CAGR", value: (row) => pct(row.divCagr5y) },
    { label: "Expense ratio", value: (row) => pct(row.expense) },
    { label: "Assets under management", value: (row) => aum(row.aum) },
    { label: "YTD total return", value: (row) => pct(row.ytd) },
    { label: "1Y total return", value: (row) => pct(row.r1y) },
    { label: "3Y total return (ann.)", value: (row) => pct(row.r3y) },
    { label: "5Y total return (ann.)", value: (row) => pct(row.r5y) },
    { label: "3Y distribution CAGR", value: (row) => pct(row.divCagr3y) },
    { label: "Max drawdown 3Y", value: (row) => pct(row.dd3y) },
    { label: "NAV erosion proxy", value: (row) => row.erosion === "n/a" ? "N/A" : row.erosion },
    { label: "Asset class / exposure", value: (row) => `${row.assetClass}${row.leveraged ? " · leveraged/inverse" : ""}` },
    { label: "Rate sensitivity", value: (row) => row.rateLabel },
  ];

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mx-auto my-4 max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:my-8" role="dialog" aria-modal="true" aria-label="Compare live ETFs">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950 p-5"><div><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Provider-backed comparison</div><h2 className="mt-1 text-xl font-extrabold text-white">Live ETF Head-to-Head</h2><p className="mt-1 text-xs text-slate-400">Only stored provider-backed values are compared. Missing fields remain N/A; this is not a forecast.</p></div><button onClick={onClose} aria-label="Close comparison" className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:text-white"><span className="text-lg leading-none">×</span></button></header>
        <div className="max-h-[calc(92vh-90px)] overflow-auto p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap gap-2">{rows.map((row) => <span key={row.ticker} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs font-bold text-emerald-300">{row.ticker}<span className="ml-2 font-sans font-normal text-slate-400">{row.name ?? ""}</span></span>)}</div>
          <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[640px] border-collapse text-left text-xs"><thead className="sticky top-0 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="w-48 border-b border-slate-800 px-4 py-3">Metric</th>{rows.map((row) => <th key={row.ticker} className="border-b border-slate-800 px-4 py-3 font-mono text-emerald-300">{row.ticker}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{fields.map((field) => <tr key={field.label} className="hover:bg-slate-800/40"><th className="bg-slate-950/40 px-4 py-3 font-sans font-semibold text-slate-400">{field.label}</th>{rows.map((row) => <td key={`${field.label}-${row.ticker}`} className="px-4 py-3 font-mono text-slate-200">{field.value(row)}</td>)}</tr>)}</tbody></table></div>
          <p className="mt-3 text-[10px] text-slate-500">Returns are based on stored distribution-adjusted history. NAV erosion is a market-price proxy. The 5Y distribution CAGR is calculated only when the underlying history covers both rolling 12-month comparison windows.</p>
        </div>
      </div>
    </div>
  );
}

export function LiveEtfScreenerView() {
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [minYield, setMinYield] = useState(0);
  const [maxExpense, setMaxExpense] = useState(1);
  const [erosionFilter, setErosionFilter] = useState<LiveErosionFilter>("ALL");
  const [frequencyFilter, setFrequencyFilter] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sortBy, setSortBy] = useState<LiveSortKey>("aum");
  const [sortDirection, setSortDirection] = useState<LiveSortDirection>("desc");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<ScreenRow[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const search = query.trim();
      const result = await requestJson<ScreenerResponse>(`/api/etfs${search ? `?q=${encodeURIComponent(search)}` : ""}`);
      if (requestId === requestSequence.current) {
        setData(result);
        setSelectedForCompare((current) => current.map((selected) => result.rows.find((row) => row.ticker === selected.ticker) ?? selected));
      }
    } catch (reason) {
      if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "ETF data could not be loaded");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const refresh = async () => {
    setRefreshing(true);
    setMessage(null);
    setError(null);
    try {
      const result = await requestJson<{ processed: { ticker: string; ok: boolean; error?: string }[]; remaining: number }>("/api/etfs/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 8 }),
      });
      const ok = result.processed.filter((item) => item.ok).length;
      setMessage(`Refreshed ${ok} ETF${ok === 1 ? "" : "s"}; ${result.remaining} remain in the hydration queue.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Refresh could not be completed");
    } finally {
      setRefreshing(false);
    }
  };

  const discover = async () => {
    setDiscovering(true);
    setMessage(null);
    setDiscoveryError(null);
    try {
      const result = await requestJson<{ universe: EtfUniverseStatus; stale: boolean; message: string }>("/api/etfs/discover", { method: "POST" });
      setMessage(`${result.message} ${result.universe.discoveredCount.toLocaleString()} active U.S.-listed ETFs are in the discovery snapshot; hydration remains batch-limited.`);
      await load();
    } catch (reason) {
      setDiscoveryError(reason instanceof Error ? reason.message : "ETF universe discovery failed");
    } finally {
      setDiscovering(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const filtered = filterLiveEtfs(data.rows, { category: categoryFilter, minYieldPct: minYield, maxExpensePct: maxExpense, erosion: erosionFilter, frequency: frequencyFilter });
    return sortLiveEtfs(filtered, sortBy, sortDirection);
  }, [data, categoryFilter, minYield, maxExpense, erosionFilter, frequencyFilter, sortBy, sortDirection]);

  const toggleCompare = (row: ScreenRow) => {
    const alreadySelected = selectedForCompare.some((item) => item.ticker === row.ticker);
    if (!alreadySelected && selectedForCompare.length >= 3) {
      setMessage("Live comparison supports up to 3 funds. Remove a selected fund before adding another.");
      return;
    }
    setMessage(null);
    setSelectedForCompare((current) => alreadySelected
      ? current.filter((item) => item.ticker !== row.ticker)
      : [...current, row]);
  };

  const handleSort = (key: LiveSortKey) => {
    if (sortBy === key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortBy(key);
      setSortDirection("desc");
    }
  };

  const hasAdvancedFilters = minYield > 0 || maxExpense < 1 || erosionFilter !== "ALL" || frequencyFilter !== "ALL" || categoryFilter !== "ALL";
  const frequencies = ["Weekly", "Monthly", "Quarterly", "Semi-annual", "Annual / irregular", "None in 12m", "None"];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 p-5 shadow-xl sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400"><Database className="h-4 w-4" /> Provider-backed ETF universe</div>
            <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">Live ETF Research</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">The familiar multi-filter table and Inspect workspace, now populated from stored provider data. Unsupported fields stay N/A; source and freshness context remain visible.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading || refreshing || discovering} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-500/50 hover:text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Reload</button>
            <button onClick={() => void discover()} disabled={discovering || refreshing || !data?.universe.configured} title={!data?.universe.configured ? "Configure POLYGON_API_KEY on the server to discover the full universe" : "Refresh the active U.S.-listed ETF ticker catalog; this does not hydrate prices or profiles"} className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:border-cyan-400/60 hover:text-white disabled:opacity-50"><Database className={`h-3.5 w-3.5 ${discovering ? "animate-pulse" : ""}`} />{discovering ? "Discovering…" : "Discover universe"}</button>
            <button onClick={() => void refresh()} disabled={refreshing || discovering} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing…" : "Hydrate next 8"}</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Stored funds" value={data ? `${data.hydrated}` : "—"} />
          <Metric label="Universe" value={data ? `${data.totalUniverse}` : "—"} />
          <Metric label="Pending" value={data ? `${data.remaining}` : "—"} />
          <Metric label="Risk-free proxy" value={pct(data?.riskFreeRate ?? null)} hint={data?.riskFreeDate ?? "FRED DGS3MO"} />
        </div>
        {data && <div className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-slate-400">
          <p><span className="font-semibold text-slate-300">Discovery:</span> {data.universe.provider} · {data.universe.discoveredCount.toLocaleString()} provider-classified ETFs · {data.universe.stale ? "snapshot stale" : data.universe.fetchedAt ? `snapshot as of ${stamp(data.universe.fetchedAt)}` : "no provider snapshot yet"}.</p>
          <p>{data.universe.configured ? "POLYGON_API_KEY is configured." : data.universe.discoveredCount ? "POLYGON_API_KEY is not configured; using the last saved provider snapshot plus curated seeds." : "POLYGON_API_KEY is not configured; the screener uses its curated seed list."} {data.universe.automatic ? "Automatic discovery and bounded background hydration are enabled." : "Automatic background discovery is off; use the controls to discover and hydrate manually."}</p>
          <p>{data.universe.classification} Hydration is limited to 8 ETFs per batch with 4 concurrent workers; full discovery only adds symbols to the queue.</p>
        </div>}
        <div className="mt-3 text-[10px] text-slate-500">Quote cache {stamp(data?.refreshedAt)}{data?.stale ? " · stale-on-error values" : ""} · Yahoo Finance quotes are delayed and unofficial.</div>
      </section>

      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{message}</div>}
      {discoveryError && <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{discoveryError}</span></div>}
      {error && <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}. For persistent data, configure PostgreSQL with DATABASE_URL and run <code className="rounded bg-slate-950 px-1 py-0.5">npm run db:migrate</code> (or use Docker Compose).</span></div>}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="ETF provider categories">
        <button onClick={() => setCategoryFilter("ALL")} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${categoryFilter === "ALL" ? "bg-emerald-600 font-bold text-white shadow-md shadow-emerald-600/30" : "border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>All Funds</button>
        {(data?.categories ?? []).map((category) => <button key={category} onClick={() => setCategoryFilter(category)} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${categoryFilter === category ? "bg-emerald-600 font-bold text-white shadow-md shadow-emerald-600/30" : "border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>{category}</button>)}
      </div>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker, fund, family, category, or holding…" aria-label="Search live ETFs" className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-emerald-500/60" /></div>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <button onClick={() => setShowFilters((open) => !open)} aria-expanded={showFilters} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${showFilters || hasAdvancedFilters ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-300" : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"}`}><SlidersHorizontal className="h-3.5 w-3.5" />Multi-Filter Controls{hasAdvancedFilters && <span className="h-2 w-2 rounded-full bg-emerald-400" />}</button>
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1"><button onClick={() => setViewMode("table")} title="Table view" aria-label="Table view" className={`rounded p-1.5 ${viewMode === "table" ? "bg-slate-800 text-emerald-300" : "text-slate-500 hover:text-slate-200"}`}><List className="h-4 w-4" /></button><button onClick={() => setViewMode("cards")} title="Card view" aria-label="Card view" className={`rounded p-1.5 ${viewMode === "cards" ? "bg-slate-800 text-emerald-300" : "text-slate-500 hover:text-slate-200"}`}><LayoutGrid className="h-4 w-4" /></button></div>
            {selectedForCompare.length > 0 && <button onClick={() => setCompareOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/10"><span>Compare Selected ({selectedForCompare.length})</span><Activity className="h-3.5 w-3.5" /></button>}
            {selectedForCompare.length > 0 && <button onClick={() => setSelectedForCompare([])} className="rounded-lg border border-slate-800 px-2.5 py-2 text-xs text-slate-400 hover:text-white">Clear</button>}
          </div>
        </div>

        {showFilters && <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="mb-1.5 flex justify-between text-slate-400"><span>Min TTM dividend yield</span><span className="font-mono font-bold text-emerald-300">{minYield.toFixed(1)}%+</span></div><input type="range" min="0" max="12" step="0.5" value={minYield} onChange={(event) => setMinYield(Number(event.target.value))} className="w-full accent-emerald-500" /><div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>0%</span><span>6%</span><span>12%+</span></div></div>
          <div><div className="mb-1.5 flex justify-between text-slate-400"><span>Max expense ratio</span><span className="font-mono font-bold text-slate-200">{maxExpense.toFixed(2)}%</span></div><input type="range" min="0.03" max="1" step="0.05" value={maxExpense} onChange={(event) => setMaxExpense(Number(event.target.value))} className="w-full accent-emerald-500" /><div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>0.03%</span><span>0.50%</span><span>1.00%+</span></div></div>
          <div><label htmlFor="live-erosion-filter" className="mb-1.5 block text-slate-400">NAV erosion proxy</label><select id="live-erosion-filter" value={erosionFilter} onChange={(event) => setErosionFilter(event.target.value as LiveErosionFilter)} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-200"><option value="ALL">Show all</option><option value="PRUDENT_ONLY">None / Mild only</option><option value="EXCLUDE_SEVERE">Exclude severe</option></select></div>
          <div><label htmlFor="live-frequency-filter" className="mb-1.5 block text-slate-400">Distribution frequency</label><select id="live-frequency-filter" value={frequencyFilter} onChange={(event) => setFrequencyFilter(event.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-200"><option value="ALL">All frequencies</option>{frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}</select></div>
          {hasAdvancedFilters && <button onClick={() => { setCategoryFilter("ALL"); setMinYield(0); setMaxExpense(1); setErosionFilter("ALL"); setFrequencyFilter("ALL"); }} className="justify-self-start text-[11px] font-semibold text-emerald-300 hover:text-emerald-200">Reset filters</button>}
        </div>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>{data ? `Showing ${filteredRows.length} of ${data.count} stored ETF${data.count === 1 ? "" : "s"}` : "Loading provider-backed funds…"} · sorted by {sortBy} ({sortDirection})</span><span>Compare up to 3 · Missing provider data remains N/A</span></div>

      {viewMode === "table" ? <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl">
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full min-w-[1960px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-20 bg-slate-950/95 font-mono text-[10px] uppercase tracking-wider text-slate-400 backdrop-blur">
              <tr>
                <th className="sticky left-0 z-30 w-12 border-b border-slate-800 bg-slate-950 px-3 py-3 text-center">Comp</th>
                <SortHeader label="Fund / Ticker" sortKey="ticker" current={sortBy} direction={sortDirection} onSort={handleSort} className="sticky left-12 z-30 min-w-56 bg-slate-950" />
                <SortHeader label="Category" sortKey="category" current={sortBy} direction={sortDirection} onSort={handleSort} />
                <SortHeader label="Quality" sortKey="qualityScore" current={sortBy} direction={sortDirection} onSort={handleSort} />
                <SortHeader label="Price" sortKey="price" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="Expense" sortKey="expense" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="Div Yield TTM" sortKey="yieldTtm" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="Last Ex-Date" sortKey="lastExDate" current={sortBy} direction={sortDirection} onSort={handleSort} />
                <SortHeader label="5Y Div CAGR" sortKey="divCagr5y" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="AUM" sortKey="aum" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="YTD" sortKey="ytd" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="1Y" sortKey="r1y" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="3Y Ann." sortKey="r3y" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="Max DD 3Y" sortKey="dd3y" current={sortBy} direction={sortDirection} onSort={handleSort} className="text-right" />
                <SortHeader label="NAV Erosion" sortKey="erosion" current={sortBy} direction={sortDirection} onSort={handleSort} />
                <SortHeader label="Strategy / Exposure" sortKey="assetClass" current={sortBy} direction={sortDirection} onSort={handleSort} />
                <th className="border-b border-slate-800 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-medium">
              {loading && !data ? <tr><td colSpan={17} className="px-4 py-12 text-center text-slate-400">Loading source-backed screener…</td></tr> : filteredRows.map((row) => {
                const selected = selectedForCompare.some((item) => item.ticker === row.ticker);
                return <tr key={row.ticker} className="group transition hover:bg-slate-800/60">
                  <td className="sticky left-0 z-10 bg-slate-900 px-3 py-3 text-center group-hover:bg-slate-800/90"><button type="button" aria-label={`${selected ? "Remove" : "Add"} ${row.ticker} ${selected ? "from" : "to"} compare list`} onClick={() => toggleCompare(row)} className={`flex h-5 w-5 items-center justify-center rounded border transition ${selected ? "border-emerald-400 bg-emerald-500 text-slate-950" : "border-slate-700 bg-slate-950 hover:border-slate-500"}`}>{selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}</button></td>
                  <td className="sticky left-12 z-10 min-w-56 bg-slate-900 px-3 py-3 group-hover:bg-slate-800/90"><button type="button" onClick={() => setSelectedTicker(row.ticker)} className="text-left"><span className="flex items-center gap-1.5"><span className="font-mono text-sm font-extrabold text-emerald-300 hover:text-emerald-200">{row.ticker}</span>{row.leveraged && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">Leveraged / inverse</span>}</span><span className="mt-0.5 block max-w-56 truncate text-[10px] font-normal text-slate-500">{row.name ?? "Fund name unavailable"}</span></button></td>
                  <td className="px-3 py-3"><span className="block max-w-40 truncate text-slate-200">{row.category ?? "N/A"}</span><span className="mt-0.5 block max-w-40 truncate text-[10px] text-slate-500">{row.family ?? "Provider family N/A"}</span></td>
                  <td className="px-3 py-3"><QualityBadge row={row} /></td>
                  <td className="px-3 py-3 text-right font-mono"><span className="block font-bold text-slate-100">{money(row.price)}</span><span className={`mt-0.5 block text-[10px] ${row.changePct != null && row.changePct < 0 ? "text-rose-400" : "text-emerald-400"}`}>{changeLabel(row.changePct)}</span></td>
                  <td className="px-3 py-3 text-right font-mono text-slate-300">{pct(row.expense)}</td>
                  <td className="px-3 py-3 text-right font-mono"><span className={`whitespace-nowrap ${row.yieldTtm != null && row.yieldTtm * 100 >= 3 ? "rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-bold text-emerald-300" : "text-slate-200"}`}>{pct(row.yieldTtm)}</span></td>
                  <td className="px-3 py-3 font-mono text-cyan-200">{dateLabel(row.lastExDate)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${row.divCagr5y != null && row.divCagr5y < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.divCagr5y)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-300">{aum(row.aum)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${row.ytd != null && row.ytd < 0 ? "text-rose-300" : "text-slate-300"}`}>{pct(row.ytd)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${row.r1y != null && row.r1y < 0 ? "text-rose-300" : "text-slate-300"}`}>{pct(row.r1y)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${row.r3y != null && row.r3y < 0 ? "text-rose-300" : "text-slate-300"}`}>{pct(row.r3y)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${row.dd3y != null && row.dd3y < 0 ? "text-rose-300" : "text-slate-300"}`}>{pct(row.dd3y)}</td>
                  <td className="px-3 py-3"><ErosionBadge value={row.erosion} /></td>
                  <td className="px-3 py-3"><span className="block whitespace-nowrap text-[11px] text-slate-200">{row.assetClass}</span><span className="mt-0.5 block whitespace-nowrap text-[10px] text-slate-500">{row.leveraged ? "Leveraged / inverse" : row.rateLabel}</span></td>
                  <td className="sticky right-0 z-10 bg-slate-900 px-3 py-3 text-right group-hover:bg-slate-800/90"><button type="button" onClick={() => setSelectedTicker(row.ticker)} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-emerald-600 hover:text-slate-950">Inspect</button></td>
                </tr>;
              })}
              {!loading && data && filteredRows.length === 0 && <tr><td colSpan={17} className="px-4 py-10 text-center text-xs text-slate-500">{data.hydrated === 0 ? `No ETF records stored yet. ${data.remaining} universe tickers are queued for refresh.` : "No stored funds match these search and filter choices."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredRows.map((row) => {
          const selected = selectedForCompare.some((item) => item.ticker === row.ticker);
          return <article key={row.ticker} className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-md transition hover:border-emerald-500/40 hover:bg-slate-800/80">
            <div>
              <header className="flex items-start justify-between gap-3"><button onClick={() => setSelectedTicker(row.ticker)} className="min-w-0 text-left"><span className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-xl font-extrabold text-emerald-300 group-hover:text-emerald-200">{row.ticker}</span>{row.leveraged && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">Leveraged / inverse</span>}</span><span className="mt-0.5 block truncate text-xs text-slate-400">{row.name ?? "Fund name unavailable"}</span></button><button aria-label={`${selected ? "Remove" : "Add"} ${row.ticker} ${selected ? "from" : "to"} compare list`} onClick={() => toggleCompare(row)} className={`flex shrink-0 items-center gap-1 rounded-lg border p-1.5 text-xs ${selected ? "border-emerald-400 bg-emerald-500 text-slate-950" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600"}`}>{selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}<span>{selected ? "Compared" : "Compare"}</span></button></header>
              <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-300">{row.category ?? "Category N/A"}</span><QualityBadge row={row} /><ErosionBadge value={row.erosion} /></div>
              <div className="my-3.5 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 font-mono text-xs sm:grid-cols-3">
                <div><span className="block text-[10px] text-slate-500">Price / change</span><span className="font-bold text-slate-100">{money(row.price)}</span><span className={`ml-1 text-[10px] ${row.changePct != null && row.changePct < 0 ? "text-rose-300" : "text-emerald-300"}`}>{changeLabel(row.changePct)}</span></div>
                <div><span className="block text-[10px] text-slate-500">Yield TTM</span><span className="font-bold text-emerald-300">{pct(row.yieldTtm)}</span></div>
                <div><span className="block text-[10px] text-slate-500">Last ex-date</span><span className="font-bold text-cyan-200">{dateLabel(row.lastExDate)}</span></div>
                <div><span className="block text-[10px] text-slate-500">5Y dividend CAGR</span><span className="font-bold text-slate-200">{pct(row.divCagr5y)}</span></div>
                <div><span className="block text-[10px] text-slate-500">Expense</span><span className="font-bold text-slate-200">{pct(row.expense)}</span></div>
                <div><span className="block text-[10px] text-slate-500">AUM</span><span className="font-bold text-slate-200">{aum(row.aum)}</span></div>
                <div><span className="block text-[10px] text-slate-500">YTD</span><span className={`font-bold ${row.ytd != null && row.ytd < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.ytd)}</span></div>
                <div><span className="block text-[10px] text-slate-500">1Y total return</span><span className={`font-bold ${row.r1y != null && row.r1y < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.r1y)}</span></div>
                <div><span className="block text-[10px] text-slate-500">3Y total return (ann.)</span><span className={`font-bold ${row.r3y != null && row.r3y < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.r3y)}</span></div>
                <div><span className="block text-[10px] text-slate-500">Max DD 3Y</span><span className={`font-bold ${row.dd3y != null && row.dd3y < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.dd3y)}</span></div>
                <div><span className="block text-[10px] text-slate-500">Asset class / type</span><span className="font-bold text-slate-200">{row.assetClass}</span></div>
                <div><span className="block text-[10px] text-slate-500">Distribution frequency</span><span className="font-bold text-slate-200">{row.freq}</span></div>
              </div>
              <p className="text-[10px] text-slate-500">Family: {row.family ?? "N/A"} · Rate sensitivity: {row.rateLabel}</p>
            </div>
            <footer className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400"><span className="font-mono">Quality is a product-grade heuristic</span><button onClick={() => setSelectedTicker(row.ticker)} className="font-semibold text-emerald-300 transition group-hover:translate-x-0.5">Inspect fund →</button></footer>
          </article>;
        })}
        {!loading && data && filteredRows.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-slate-800 p-10 text-center text-xs text-slate-500">{data.hydrated === 0 ? `No ETF records stored yet. ${data.remaining} universe tickers are queued for refresh.` : "No stored funds match these search and filter choices."}</div>}
      </div>}

      <details className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-300">Metric definitions & data integrity<ChevronDown className="h-4 w-4 text-slate-500" /></summary>
        <div className="mt-3 grid gap-2 leading-relaxed sm:grid-cols-2"><p><b className="text-slate-200">Returns:</b> total return uses distribution-adjusted history; periods over one year are annualized.</p><p><b className="text-slate-200">5Y dividend CAGR:</b> compares rolling TTM distributions five years apart and requires six years of history.</p><p><b className="text-slate-200">Last ex-date:</b> the latest historical distribution event, not a future calendar estimate.</p><p><b className="text-slate-200">NAV erosion:</b> market-price proxy; not an official return-of-capital determination.</p><p><b className="text-slate-200">Quality:</b> rules-based product-construction grade, not a Morningstar rating or return forecast.</p><p><b className="text-slate-200">Missing values:</b> provider gaps remain N/A. Failed refreshes do not overwrite stored good data.</p></div>
      </details>

      {selectedTicker && <LiveEtfDetailModal key={selectedTicker} row={data?.rows.find((row) => row.ticker === selectedTicker) ?? selectedForCompare.find((row) => row.ticker === selectedTicker) ?? { ticker: selectedTicker, name: null, category: null, family: null, leveraged: false, assetClass: "Other", rateTag: "neutral", rateLabel: "Rate context unavailable", quality: null, qualityScore: null, price: null, changePct: null, expense: null, yieldTtm: null, aum: null, ytd: null, r1y: null, r3y: null, r5y: null, vol3y: null, dd3y: null, sharpe: null, erosion: "n/a", priceRet3y: null, capFunded: null, divCagr3y: null, divCagr5y: null, lastExDate: null, analystRec: null, analystCoverage: null, freq: "N/A" }} onClose={() => setSelectedTicker(null)} isCompared={selectedForCompare.some((row) => row.ticker === selectedTicker)} compareLimitReached={selectedForCompare.length >= 3 && !selectedForCompare.some((row) => row.ticker === selectedTicker)} onToggleCompare={toggleCompare} onOpenCompare={() => setCompareOpen(true)} />}
      {compareOpen && selectedForCompare.length > 0 && <CompareModal rows={selectedForCompare} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}
