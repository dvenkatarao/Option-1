"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StockEventsJson } from "../../db/schema";
import type { StockInputs, StockQuality } from "../../lib/stock-quality";
import type { Technicals } from "../../lib/technicals";
import { DEFAULT_PARAMS, scanCalls, scanPuts, type OptionContract, type StockCtx } from "../../lib/wheel";

const inputClass = "w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60";
const cash = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(digits)}%`;
// Yahoo regularMarketChangePercent is already in percentage points, unlike fractional ratios formatted by pct().
const percentPoints = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "N/A" : `${value.toFixed(digits)}%`;
const multiple = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "N/A" : `${value.toFixed(digits)}x`;
const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

type PriceBar = { t: number; o: number; h: number; l: number; c: number; v: number };
type Quote = { price: number | null; change: number | null; changePct: number | null; marketState?: string };
type StockDetail = {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  storedPrice: number | null;
  fundamentals: StockInputs | null;
  events: StockEventsJson | null;
  technicals: Technicals | null;
  grade: string | null;
  quality: StockQuality | null;
  refreshedAt: string | null;
  priceBarAsOf: string | null;
  lastError: string | null;
};
type DetailResponse = {
  stock: StockDetail;
  quote: Quote | null;
  quoteFetchedAt: string | null;
  quoteStale: boolean;
  quoteSource: string;
  history: PriceBar[];
  historyFetchedAt: string | null;
  historyStale: boolean;
  historySource: string | null;
};
type ChainResponse = {
  symbol: string;
  price: number;
  nextEarnings: string | null;
  source: string;
  fetchedAt: string | null;
  stale: boolean;
  fallbackReasons: string[];
  contracts: OptionContract[];
};
type OptionHistoryPoint = {
  bucket: string;
  fetchedAt: string;
  providerTimestamp: string | null;
  source: string;
  underlyingPrice: number | null;
  bid: number | null;
  ask: number | null;
  last: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  openInterest: number | null;
  volume: number | null;
};
type OptionHistoryResponse = { contract: string; days: number; history: OptionHistoryPoint[]; historyStartsAt: string | null };
type DetailTab = "Overview" | "Technicals" | "Options" | "Wheel plan";
type OptionFilter = "all" | "put" | "call";
type SortMode = "return" | "delta" | "openInterest";

function Metric({ label, value, hint, tone = "text-slate-100", compact = false }: { label: string; value: string; hint?: string; tone?: string; compact?: boolean }) {
  return <div className={`rounded-xl border border-slate-800 bg-slate-950/80 ${compact ? "p-2.5" : "p-3"}`}><div className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold uppercase tracking-wider text-slate-400`}>{label}</div><div className={`mt-1 font-mono ${compact ? "text-[13px]" : "text-sm"} font-bold ${tone}`}>{value}</div>{hint && <div className={`mt-1 ${compact ? "text-[10px]" : "text-[11px]"} leading-relaxed text-slate-400`}>{hint}</div>}</div>;
}

function CompactMetric({ label, value, hint, tone = "text-slate-100" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-slate-800/80 pb-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-0.5 break-words font-mono text-xs font-bold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] leading-snug text-slate-400">{hint}</div>}
    </div>
  );
}

function seriesWithAverages(bars: PriceBar[]) {
  const prefix = [0];
  for (const bar of bars) prefix.push(prefix[prefix.length - 1] + bar.c);
  return bars.map((bar, index) => {
    const windowAverage = (size: number) => index + 1 < size ? null : (prefix[index + 1] - prefix[index + 1 - size]) / size;
    return { date: new Date(bar.t * 1000).toISOString().slice(0, 10), close: bar.c, sma50: windowAverage(50), sma200: windowAverage(200), volume: bar.v };
  });
}

function UnderlyingChart({ bars, price, technicals, compact = false, onToggleCompact }: { bars: PriceBar[]; price: number | null; technicals: Technicals | null; compact?: boolean; onToggleCompact?: () => void }) {
  const series = useMemo(() => seriesWithAverages(bars).slice(-252), [bars]);
  const chartHeight = compact ? "h-48" : "h-64";
  if (series.length < 2) return <div className={`grid ${chartHeight} place-items-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-400`}>Daily price history is unavailable. Try refreshing the stock data.</div>;
  return <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xs font-bold text-white">Underlying · trailing 1 year</h3><p className="mt-1 text-[11px] text-slate-400">Daily close with calculated 50/200-day simple moving averages. Not an intraday chart.</p></div><div className="flex flex-wrap items-center gap-3"><div className="flex flex-wrap gap-3 text-[10px]"><span className="text-cyan-300">● Close</span><span className="text-amber-300">● SMA 50</span><span className="text-violet-300">● SMA 200</span></div>{onToggleCompact && <button type="button" aria-expanded={!compact} onClick={onToggleCompact} className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-900 hover:text-white">{compact ? "Expand chart" : "Compact chart"}</button>}</div></div>
    <div className={`${chartHeight} w-full`}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="4 5" />
        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} minTickGap={38} tickFormatter={(value: string) => value.slice(5)} />
        <YAxis domain={["auto", "auto"]} width={58} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value: number) => `$${value.toFixed(0)}`} />
        <Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#cbd5e1" }} formatter={(value, name) => [typeof value === "number" ? cash(value) : "N/A", String(name)]} />
        {price != null && <ReferenceLine y={price} stroke="#34d399" strokeDasharray="3 5" />}
        <Line type="monotone" dataKey="close" name="Close" stroke="#67e8f9" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#fbbf24" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="sma200" name="SMA 200" stroke="#c4b5fd" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
      </LineChart></ResponsiveContainer>
    </div>
    <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-400"><span>{series[0].date} → {series[series.length - 1].date}</span><span>Bar as of {technicals?.asOf ?? "unknown"}</span></div>
  </div>;
}

function OptionHistoryChart({ points, metric }: { points: OptionHistoryPoint[]; metric: "mid" | "iv" }) {
  const series = points.map((point) => ({
    time: new Date(point.bucket).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    value: metric === "mid" ? (point.bid != null && point.ask != null ? (point.bid + point.ask) / 2 : point.last) : point.iv,
  })).filter((point) => point.value != null);
  if (series.length < 2) return <div className="grid h-40 place-items-center rounded-lg border border-dashed border-slate-800 px-4 text-center text-[11px] leading-relaxed text-slate-400">At least two stored samples are needed to draw this chart. The app starts collecting 15-minute snapshots when this contract is opened during regular market hours; history is not backfilled.</div>;
  return <div className="h-40 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><defs><linearGradient id={`option-${metric}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={metric === "mid" ? "#34d399" : "#22d3ee"} stopOpacity={0.28} /><stop offset="95%" stopColor={metric === "mid" ? "#34d399" : "#22d3ee"} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#334155" strokeDasharray="4 5" /><XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 9 }} minTickGap={32} /><YAxis width={52} tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(value: number) => metric === "mid" ? `$${value.toFixed(2)}` : `${(value * 100).toFixed(0)}%`} /><Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155", borderRadius: 8, fontSize: 10 }} formatter={(value) => [typeof value === "number" ? metric === "mid" ? cash(value) : pct(value) : "N/A", metric === "mid" ? "Mid / last" : "IV"]} /><Area type="monotone" dataKey="value" stroke={metric === "mid" ? "#34d399" : "#22d3ee"} fill={`url(#option-${metric}-fill)`} dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>;
}

function payoffPoints(contract: OptionContract, spot: number, basis: number | null, credit: number) {
  const anchor = contract.type === "call" && basis != null ? basis : spot;
  const low = Math.max(0.01, Math.min(anchor, contract.strike, spot) * 0.7);
  const high = Math.max(anchor, contract.strike, spot) * 1.3;
  return Array.from({ length: 31 }, (_, i) => {
    const underlying = low + ((high - low) * i) / 30;
    const pnl = contract.type === "put"
      ? credit - Math.max(contract.strike - underlying, 0)
      : basis == null ? 0 : Math.min(underlying, contract.strike) - basis + credit;
    return { underlying, pnl };
  });
}

export function LiveWheelDetailView({ ticker, onClose, onUseContract }: { ticker: string; onClose: () => void; onUseContract: (contract: OptionContract, costBasis: number | null) => void }) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chainLoading, setChainLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("Overview");
  const [overviewChartExpanded, setOverviewChartExpanded] = useState(false);
  const [optionFilter, setOptionFilter] = useState<OptionFilter>("all");
  const [expirationFilter, setExpirationFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("return");
  const [minOi, setMinOi] = useState("0");
  const [chainPage, setChainPage] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<{ symbol: string; history: OptionHistoryPoint[]; error: string | null } | null>(null);
  const [historyMetric, setHistoryMetric] = useState<"mid" | "iv">("mid");
  const [costBasisInput, setCostBasisInput] = useState("");

  const load = useCallback(async () => {
    setChainPage(0);
    setDetail(null);
    setChain(null);
    setSelectedSymbol(null);
    setHistoryData(null);
    setLoading(true);
    setChainLoading(true);
    setError(null);
    setChainError(null);
    const [detailResult, chainResult] = await Promise.allSettled([
      requestJson<DetailResponse>(`/api/wheel/stocks/${encodeURIComponent(ticker)}`),
      requestJson<ChainResponse>(`/api/wheel/chain?symbol=${encodeURIComponent(ticker)}&type=both&dteMin=7&dteMax=75`),
    ]);
    if (detailResult.status === "fulfilled") setDetail(detailResult.value);
    else setError(detailResult.reason instanceof Error ? detailResult.reason.message : "Stock detail could not be loaded");
    if (chainResult.status === "fulfilled") {
      setChain(chainResult.value);
      setSelectedSymbol((current) => current ?? chainResult.value.contracts[0]?.symbol ?? null);
    } else setChainError(chainResult.reason instanceof Error ? chainResult.reason.message : "Option chain could not be loaded");
    setLoading(false);
    setChainLoading(false);
  }, [ticker]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedContract = chain?.contracts.find((contract) => contract.symbol === selectedSymbol) ?? null;
  const history = historyData?.symbol === selectedSymbol ? historyData.history : [];
  const historyError = historyData?.symbol === selectedSymbol ? historyData.error : null;
  const historyLoading = selectedSymbol != null && historyData?.symbol !== selectedSymbol;
  useEffect(() => {
    if (!selectedSymbol) return;
    let active = true;
    const symbol = selectedSymbol;
    requestJson<OptionHistoryResponse>(`/api/wheel/options/history?contract=${encodeURIComponent(symbol)}&days=30`)
      .then((response) => { if (active) setHistoryData({ symbol, history: response.history ?? [], error: null }); })
      .catch((e: unknown) => { if (active) setHistoryData({ symbol, history: [], error: e instanceof Error ? e.message : "Option history could not be loaded" }); });
    return () => { active = false; };
  }, [selectedSymbol]);

  const stock = detail?.stock ?? null;
  const quotePrice = detail?.quote?.price ?? stock?.storedPrice ?? stock?.technicals?.price ?? null;
  const underlyingPrice = chain?.price ?? quotePrice;
  const costBasis = Number(costBasisInput);
  const hasCostBasis = Number.isFinite(costBasis) && costBasis > 0;
  const context = useMemo<StockCtx | null>(() => {
    if (!stock || quotePrice == null || !stock.technicals) return null;
    return {
      ticker: stock.ticker,
      price: quotePrice,
      nextEarnings: stock.events?.nextEarnings ?? null,
      earningsEstimated: stock.events?.earningsEstimated ?? false,
      exDividend: stock.events?.exDividend ?? null,
      dividendPerShare: stock.events?.dividendPerShare ?? null,
      dividendYield: stock.events?.dividendYield ?? null,
      beta: stock.fundamentals?.beta ?? null,
      hv30: stock.technicals.hv30,
      sma200: stock.technicals.sma200,
      supports: stock.technicals.supports.map((level) => level.price),
    };
  }, [stock, quotePrice]);

  const putScan = useMemo(() => {
    if (!context || !chain) return null;
    return scanPuts(chain.contracts, context, DEFAULT_PARAMS, new Date().toISOString().slice(0, 10));
  }, [chain, context]);
  const callScan = useMemo(() => {
    if (!context || !chain || !hasCostBasis) return null;
    return scanCalls(chain.contracts, context, costBasis, DEFAULT_PARAMS, new Date().toISOString().slice(0, 10));
  }, [chain, context, hasCostBasis, costBasis]);
  const putCandidatesByReturn = useMemo(() => [...(putScan?.candidates ?? [])].sort((a, b) => b.annRoc - a.annRoc), [putScan]);
  const callCandidatesByReturn = useMemo(() => [...(callScan?.candidates ?? [])].sort((a, b) => b.annYield - a.annYield), [callScan]);

  const expirations = useMemo(() => [...new Set((chain?.contracts ?? []).map((contract) => contract.expiration))].sort(), [chain]);
  const filteredContracts = useMemo(() => {
    const minOpenInterest = Number(minOi) || 0;
    const values = (chain?.contracts ?? []).filter((contract) => {
      if (optionFilter !== "all" && contract.type !== optionFilter) return false;
      if (expirationFilter !== "all" && contract.expiration !== expirationFilter) return false;
      if ((contract.oi ?? 0) < minOpenInterest) return false;
      return true;
    });
    const estimatedReturn = (contract: OptionContract) => {
      if (contract.bid == null || contract.ask == null || contract.ask < contract.bid) return null;
      const credit = contract.bid + 0.25 * (contract.ask - contract.bid);
      const dte = Math.max(1, Math.round((Date.parse(`${contract.expiration}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000));
      const base = contract.type === "put" ? contract.strike - credit : hasCostBasis ? costBasis : null;
      if (base == null || base <= 0) return null;
      return (credit / base) * (365 / dte);
    };
    return values.sort((a, b) => {
      if (sortMode === "delta") return Math.abs(a.delta ?? 2) - Math.abs(b.delta ?? 2);
      if (sortMode === "openInterest") return (b.oi ?? -1) - (a.oi ?? -1);
      return (estimatedReturn(b) ?? -Infinity) - (estimatedReturn(a) ?? -Infinity);
    });
  }, [chain, optionFilter, expirationFilter, minOi, sortMode, costBasis, hasCostBasis]);
  const chainPageSize = 100;
  const chainPageCount = Math.max(1, Math.ceil(filteredContracts.length / chainPageSize));
  const safeChainPage = Math.min(chainPage, chainPageCount - 1);
  const visibleContracts = filteredContracts.slice(safeChainPage * chainPageSize, (safeChainPage + 1) * chainPageSize);

  const selectedCredit = selectedContract?.bid != null && selectedContract.ask != null && selectedContract.ask >= selectedContract.bid
    ? selectedContract.bid + 0.25 * (selectedContract.ask - selectedContract.bid)
    : selectedContract?.bid ?? selectedContract?.last ?? 0;
  const dte = selectedContract ? Math.max(1, Math.round((Date.parse(`${selectedContract.expiration}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000)) : 0;
  const selectedReturn = selectedContract && dte > 0 && (selectedContract.type === "put" || hasCostBasis)
    ? (selectedCredit / (selectedContract.type === "put" ? Math.max(0.01, selectedContract.strike - selectedCredit) : costBasis)) * (365 / dte)
    : null;
  const payoff = selectedContract && underlyingPrice != null && (selectedContract.type === "put" || hasCostBasis)
    ? payoffPoints(selectedContract, underlyingPrice, hasCostBasis ? costBasis : null, selectedCredit)
    : [];

  const useSelectedContract = () => { if (selectedContract) onUseContract(selectedContract, hasCostBasis ? costBasis : null); };

  return <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/90 p-2 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true" aria-label={`${ticker} wheel details`}>
    <div className="mx-auto min-h-[92vh] max-w-[1500px] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
      <header className="sticky top-0 z-20 flex flex-col justify-between gap-3 rounded-t-2xl border-b border-slate-800 bg-slate-950/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"><Activity className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-mono text-xl font-extrabold text-white">{ticker}</h2>{stock?.grade && <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">{stock.grade} · {stock.quality?.score?.toFixed(0) ?? "—"}</span>}{detail?.quoteStale && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">stale quote</span>}</div><p className="mt-0.5 text-[11px] text-slate-400">{stock?.name ?? "Loading company profile…"} · {stock?.sector ?? "Sector unavailable"} · {detail?.quoteSource ?? "Yahoo Finance (unofficial; delayed)"}</p></div></div>
        <div className="flex min-w-0 items-center gap-2"><div className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right text-[10px] leading-snug text-slate-400 md:flex"><span>Quote fetched {stamp(detail?.quoteFetchedAt)}</span><span>Daily bars: {detail?.historySource ?? "source unavailable"} · as of {stock?.priceBarAsOf ?? "—"} · fetched {stamp(detail?.historyFetchedAt)}{detail?.historyStale ? " · cached/stale" : ""}</span><span>Fundamentals refreshed {stamp(stock?.refreshedAt)}</span></div><button onClick={() => void load()} disabled={loading || chainLoading} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading || chainLoading ? "animate-spin" : ""}`} />Refresh</button><button onClick={onClose} aria-label="Close ticker details" className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></div>
      </header>

      <div className="border-b border-slate-800 px-4 sm:px-6"><nav className="flex gap-1 overflow-x-auto py-2">{(["Overview", "Technicals", "Options", "Wheel plan"] as DetailTab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold transition ${tab === item ? "bg-emerald-600 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>{item}</button>)}</nav></div>

      <main className="space-y-5 p-4 sm:p-6">
        {(error || chainError) && <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{[error, chainError].filter(Boolean).join(" · ")}.</div>}
        {stock?.lastError && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-100/80">Latest fundamentals refresh failed: {stock.lastError}. Stored fields are retained; review the source timestamp before relying on them.</div>}
        {!detail && loading ? <div className="grid min-h-80 place-items-center text-sm text-slate-400">Loading stored fundamentals, technicals, and daily bars…</div> : null}

        {tab === "Overview" && stock && <div className="space-y-4">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Metric compact label="Underlying" value={cash(quotePrice)} hint={detail?.quote?.marketState ?? "Delayed quote / stored close fallback"} />
            <Metric compact label="Day change" value={percentPoints(detail?.quote?.changePct)} tone={detail?.quote?.changePct != null && detail.quote.changePct < 0 ? "text-rose-300" : "text-emerald-300"} />
            <Metric compact label="Stock grade" value={stock.grade ?? "N/A"} hint={`Score ${stock.quality?.score?.toFixed(1) ?? "—"} · coverage ${pct(stock.quality?.coverage ?? null)}`} />
            <Metric compact label="Market cap" value={cash(stock.marketCap, 0)} />
            <Metric compact label="Beta" value={stock.fundamentals?.beta?.toFixed(2) ?? "N/A"} />
            <Metric compact label="Next earnings" value={stock.events?.nextEarnings ?? "Unknown"} hint={stock.events?.earningsEstimated ? "Provider date window; estimated" : undefined} />
          </section>
          <section aria-label="Additional fundamentals" className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
              <CompactMetric label="Forward P/E" value={multiple(stock.fundamentals?.forwardPE)} />
              <CompactMetric label="Trailing P/E" value={multiple(stock.fundamentals?.trailingPE)} />
              <CompactMetric label="Operating margin" value={pct(stock.fundamentals?.operatingMargin)} />
              <CompactMetric label="Profit margin" value={pct(stock.fundamentals?.profitMargin)} />
              <CompactMetric label="Return on equity" value={pct(stock.fundamentals?.roe)} />
              <CompactMetric label="Free cash flow" value={cash(stock.fundamentals?.freeCashflow, 0)} />
              <CompactMetric label="FCF yield" value={stock.fundamentals?.freeCashflow != null && stock.marketCap ? pct(stock.fundamentals.freeCashflow / stock.marketCap) : "N/A"} />
              <CompactMetric label="Debt / equity" value={multiple(stock.fundamentals?.debtToEquity)} />
              <CompactMetric label="Current ratio" value={multiple(stock.fundamentals?.currentRatio)} />
              <CompactMetric label="Analyst view" value={stock.fundamentals?.recMean?.toFixed(2) ?? "N/A"} hint={`${stock.fundamentals?.analystCount ?? "N/A"} analysts · 1=strong buy, 5=sell`} />
              <CompactMetric label="Mean target" value={cash(stock.fundamentals?.targetMean)} hint={stock.fundamentals?.targetMean != null && quotePrice ? `${pct(stock.fundamentals.targetMean / quotePrice - 1)} vs current price` : undefined} />
              <CompactMetric label="Revenue" value={cash(stock.fundamentals?.totalRevenue, 0)} />
            </div>
          </section>
          <UnderlyingChart bars={detail?.history ?? []} price={quotePrice} technicals={stock.technicals} compact={!overviewChartExpanded} onToggleCompact={() => setOverviewChartExpanded((expanded) => !expanded)} />
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold text-white">Stock quality pillars · WheelCore heuristic</h3></div><p className="mt-1 text-[11px] leading-relaxed text-slate-400">This is a deterministic research score computed from stored Yahoo fundamentals; it is not a provider rating or a forecast.</p><div className="mt-4 space-y-3">{stock.quality?.pillars.map((pillar) => <div key={pillar.key}><div className="mb-1 flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-slate-300">{pillar.label} <span className="text-slate-400">· {(pillar.weight * 100).toFixed(0)}%</span></span><span className="font-mono text-[10px] text-emerald-300">{pillar.score?.toFixed(0) ?? "N/A"}{pillar.letter ? ` · ${pillar.letter}` : ""}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, pillar.score ?? 0))}%` }} /></div><p className="mt-1 text-[11px] leading-relaxed text-slate-400">{pillar.detail}</p></div>) ?? <p className="text-xs text-slate-500">Quality score unavailable until fundamentals are hydrated.</p>}</div>{stock.quality?.caps.length ? <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/5 p-3 text-[11px] text-amber-200">Grade caps: {stock.quality.caps.join(" · ")}</div> : null}</div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-cyan-300" /><h3 className="text-xs font-bold text-white">Upcoming events & distributions</h3></div><div className="mt-3 space-y-3 text-[11px]"><div className="flex justify-between gap-3"><span className="text-slate-400">Earnings</span><span className="text-right text-slate-200">{stock.events?.nextEarnings ?? "Not reported"}{stock.events?.earningsEstimated ? " · estimated" : ""}</span></div><div className="flex justify-between gap-3"><span className="text-slate-400">Ex-dividend</span><span className="text-slate-200">{stock.events?.exDividend ?? "Not reported"}</span></div><div className="flex justify-between gap-3"><span className="text-slate-400">Dividend / share</span><span className="font-mono text-slate-200">{cash(stock.events?.dividendPerShare)}</span></div><div className="flex justify-between gap-3"><span className="text-slate-400">Dividend yield</span><span className="font-mono text-slate-200">{pct(stock.events?.dividendYield)}</span></div></div><div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-[11px] leading-relaxed text-slate-400">Unknown provider dates remain unknown. Earnings and ex-dividend dates can change; verify against the issuer before trading.</div></div>
          </section>
        </div>}

        {tab === "Technicals" && stock && <div className="space-y-5">
          <UnderlyingChart bars={detail?.history ?? []} price={quotePrice} technicals={stock.technicals} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="SMA 50" value={cash(stock.technicals?.sma50)} />
            <Metric label="SMA 200" value={cash(stock.technicals?.sma200)} />
            <Metric label="EMA 21 / 50 / 200" value={`${cash(stock.technicals?.ema21)} / ${cash(stock.technicals?.ema50)} / ${cash(stock.technicals?.ema200)}`} />
            <Metric label="RSI 14" value={stock.technicals?.rsi14?.toFixed(1) ?? "N/A"} hint="State indicator; not a forecast" />
            <Metric label="MACD / signal" value={stock.technicals?.macd ? `${stock.technicals.macd.line.toFixed(2)} / ${stock.technicals.macd.signal.toFixed(2)}` : "N/A"} hint={stock.technicals?.macd?.crossed ? `Latest cross ${stock.technicals.macd.crossed}` : stock.technicals?.macd?.state ?? undefined} />
            <Metric label="Bollinger 20,2" value={stock.technicals?.boll ? `${cash(stock.technicals.boll.lower)} – ${cash(stock.technicals.boll.upper)}` : "N/A"} hint={stock.technicals?.boll ? `%B ${stock.technicals.boll.pctB.toFixed(2)} · width ${pct(stock.technicals.boll.bandwidth)}` : undefined} />
            <Metric label="ATR 14" value={cash(stock.technicals?.atr14)} hint={pct(stock.technicals?.atrPct)} />
            <Metric label="Historical volatility 30d" value={pct(stock.technicals?.hv30)} />
            <Metric label="1Y max drawdown" value={pct(stock.technicals?.dd1y)} />
            <Metric label="52-week range" value={`${cash(stock.technicals?.lo52)} – ${cash(stock.technicals?.hi52)}`} />
            <Metric label="VWMA 20 / 50" value={`${cash(stock.technicals?.vwma20)} / ${cash(stock.technicals?.vwma50)}`} />
            <Metric label="VWAP YTD" value={cash(stock.technicals?.vwapYtd)} />
          </div>
          <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><h3 className="text-xs font-bold text-white">Support levels</h3><div className="mt-3 space-y-2">{stock.technicals?.supports.map((level, index) => <div key={`${level.price}-${index}`} className="flex items-center justify-between rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-[10px]"><span className="font-mono text-emerald-200">{cash(level.price)}</span><span className="text-slate-500">{level.touches} touches · {level.lastTouchDaysAgo} bars ago · {pct(level.distancePct)}</span></div>) ?? null}{!stock.technicals?.supports.length && <p className="text-[10px] text-slate-500">No repeated support pivots found in the lookback window.</p>}</div></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><h3 className="text-xs font-bold text-white">Resistance levels</h3><div className="mt-3 space-y-2">{stock.technicals?.resistances.map((level, index) => <div key={`${level.price}-${index}`} className="flex items-center justify-between rounded-lg border border-rose-500/10 bg-rose-500/5 px-3 py-2 text-[10px]"><span className="font-mono text-rose-200">{cash(level.price)}</span><span className="text-slate-500">{level.touches} touches · {level.lastTouchDaysAgo} bars ago · {pct(level.distancePct)}</span></div>) ?? null}{!stock.technicals?.resistances.length && <p className="text-[10px] text-slate-500">No repeated resistance pivots found in the lookback window.</p>}</div></div></section>
        </div>}

        {tab === "Options" && <div className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300"><BarChart3 className="h-4 w-4" /> Full option-chain explorer</div><p className="mt-1 text-[10px] text-slate-500">All provider-returned strikes in the 7–75 DTE window are shown (up to 1,000 contracts per side; 100 rows per page). Quotes may be delayed. Provider Greeks and Black–Scholes estimates are identified separately.</p></div><div className="flex flex-wrap gap-2"><label className="min-w-28 text-[10px] text-slate-500">Type<select value={optionFilter} onChange={(event) => { setOptionFilter(event.target.value as OptionFilter); setChainPage(0); }} className={inputClass + " mt-1"}><option value="all">Calls + puts</option><option value="put">Puts</option><option value="call">Calls</option></select></label><label className="min-w-36 text-[10px] text-slate-500">Expiration<select value={expirationFilter} onChange={(event) => { setExpirationFilter(event.target.value); setChainPage(0); }} className={inputClass + " mt-1"}><option value="all">All dates</option>{expirations.map((date) => <option key={date}>{date}</option>)}</select></label><label className="w-28 text-[10px] text-slate-500">Min OI<input type="number" min="0" value={minOi} onChange={(event) => { setMinOi(event.target.value); setChainPage(0); }} className={inputClass + " mt-1"} /></label><label className="min-w-40 text-[10px] text-slate-500">Sort by<select value={sortMode} onChange={(event) => { setSortMode(event.target.value as SortMode); setChainPage(0); }} className={inputClass + " mt-1"}><option value="return">Est. annual return</option><option value="delta">Absolute delta</option><option value="openInterest">Open interest</option></select></label></div></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>{chainLoading ? "Loading provider chain…" : `${filteredContracts.length} of ${chain?.contracts.length ?? 0} contracts · page ${safeChainPage + 1}/${chainPageCount}`} · spot {cash(underlyingPrice)}</span><span>{chain?.source ?? "Provider unavailable"} · {chain?.stale ? "stale cache" : `fetched ${stamp(chain?.fetchedAt)}`}{chain?.fallbackReasons?.length ? ` · ${chain.fallbackReasons.join("; ")}` : ""}</span></div>
          </section>
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.6fr)]">
            <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><div className="max-h-[58vh] overflow-auto"><table className="min-w-[1100px] w-full text-left text-[10px]"><thead className="sticky top-0 z-10 bg-slate-900 uppercase tracking-wider text-slate-500"><tr>{["Type", "Expiration", "Strike", "Bid / ask", "Est. credit", "Ann. ROC", "Delta", "Gamma", "Theta/day", "Vega", "IV", "OI / volume", "Source"].map((label) => <th key={label} className="px-2.5 py-2.5 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{visibleContracts.map((contract) => { const credit = contract.bid != null && contract.ask != null && contract.ask >= contract.bid ? contract.bid + 0.25 * (contract.ask - contract.bid) : contract.bid ?? 0; const days = Math.max(1, Math.round((Date.parse(`${contract.expiration}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000)); const denom = contract.type === "put" ? contract.strike - credit : hasCostBasis ? costBasis : null; const roc = denom != null && denom > 0 ? credit / denom * 365 / days : null; return <tr key={contract.symbol} onClick={() => setSelectedSymbol(contract.symbol)} className={`cursor-pointer hover:bg-slate-800/60 ${selectedSymbol === contract.symbol ? "bg-emerald-950/30" : ""}`}><td className={`px-2.5 py-2 font-bold uppercase ${contract.type === "put" ? "text-rose-300" : "text-cyan-300"}`}>{contract.type}</td><td className="px-2.5 py-2 text-slate-400">{contract.expiration}</td><td className="px-2.5 py-2 font-mono font-bold text-white">{cash(contract.strike)}</td><td className="px-2.5 py-2 font-mono text-slate-300">{cash(contract.bid)} / {cash(contract.ask)}</td><td className="px-2.5 py-2 font-mono text-emerald-300">{cash(credit)}</td><td className="px-2.5 py-2 font-mono text-slate-200">{pct(roc)}</td><td className="px-2.5 py-2 font-mono text-slate-300">{contract.delta?.toFixed(3) ?? "N/A"}</td><td className="px-2.5 py-2 font-mono text-slate-400">{contract.gamma?.toFixed(4) ?? "N/A"}</td><td className="px-2.5 py-2 font-mono text-slate-400">{contract.theta?.toFixed(4) ?? "N/A"}</td><td className="px-2.5 py-2 font-mono text-slate-400">{contract.vega?.toFixed(3) ?? "N/A"}</td><td className="px-2.5 py-2 font-mono text-slate-300">{pct(contract.iv)}</td><td className="px-2.5 py-2 font-mono text-slate-400">{contract.oi?.toLocaleString() ?? "N/A"} / {contract.volume?.toLocaleString() ?? "N/A"}</td><td className="px-2.5 py-2"><span className="rounded border border-slate-800 px-1.5 py-1 text-[9px] text-slate-400">{contract.source}</span></td></tr>; })}{!chainLoading && filteredContracts.length === 0 && <tr><td colSpan={13} className="p-8 text-center text-slate-500">No contracts match these filters.</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-[9px] text-slate-500"><span>Showing {filteredContracts.length ? safeChainPage * chainPageSize + 1 : 0}–{Math.min((safeChainPage + 1) * chainPageSize, filteredContracts.length)} of {filteredContracts.length}</span><div className="flex gap-1"><button onClick={() => setChainPage(Math.max(0, safeChainPage - 1))} disabled={safeChainPage === 0} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Previous</button><button onClick={() => setChainPage(Math.min(chainPageCount - 1, safeChainPage + 1))} disabled={safeChainPage + 1 >= chainPageCount} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">Next</button></div></div></section>
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-bold text-white">Selected contract</h3><p className="mt-1 font-mono text-[10px] text-slate-500">{selectedContract?.symbol ?? "Choose a row from the chain"}</p></div>{selectedContract && <button onClick={useSelectedContract} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-slate-950 hover:bg-emerald-500"><CheckCircle2 className="h-3 w-3" />Use in journal</button>}</div>
                {selectedContract && <><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Bid / ask" value={`${cash(selectedContract.bid)} / ${cash(selectedContract.ask)}`} /><Metric label="Modeled fill" value={cash(selectedCredit)} hint="Bid + 25% of the spread, before fees/slippage" /><Metric label="Break-even" value={cash(selectedContract.type === "put" ? selectedContract.strike - selectedCredit : hasCostBasis ? costBasis - selectedCredit : null)} /><Metric label="Ann. return" value={pct(selectedReturn)} hint="Simple annualization; not a forecast" /><Metric label="Max loss" value={selectedContract.type === "put" ? cash(selectedContract.strike * 100 - selectedCredit * 100) : hasCostBasis ? cash(costBasis * 100 - selectedCredit * 100) : "Requires cost basis"} /><Metric label="Prob. OTM proxy" value={pct(selectedContract.delta == null ? null : 1 - Math.abs(selectedContract.delta))} hint="1 − absolute delta; not a calibrated probability" /></div><div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3"><div className="flex flex-wrap justify-between gap-2 text-[10px] text-slate-500"><span>Greeks: {selectedContract.greeksSource ?? selectedContract.deltaSource ?? "unavailable"}</span><span>Quote timestamp: {stamp(selectedContract.quoteTimestamp)}</span></div><div className="mt-2 grid grid-cols-5 gap-1 text-center text-[9px]"><span className="text-slate-500">Δ<br/><b className="font-mono text-slate-200">{selectedContract.delta?.toFixed(3) ?? "—"}</b></span><span className="text-slate-500">Γ<br/><b className="font-mono text-slate-200">{selectedContract.gamma?.toFixed(4) ?? "—"}</b></span><span className="text-slate-500">Θ/day<br/><b className="font-mono text-slate-200">{selectedContract.theta?.toFixed(4) ?? "—"}</b></span><span className="text-slate-500">Vega<br/><b className="font-mono text-slate-200">{selectedContract.vega?.toFixed(3) ?? "—"}</b></span><span className="text-slate-500">Rho<br/><b className="font-mono text-slate-200">{selectedContract.rho?.toFixed(3) ?? "—"}</b></span></div><p className="mt-2 text-[10px] leading-relaxed text-slate-500">Model units: gamma per $1 underlying move; theta per calendar day; vega/rho per 1 percentage point. Black–Scholes is a European approximation and does not model early exercise.</p></div>
                <div className="mt-3"><div className="mb-2 flex items-center justify-between gap-2"><div><h4 className="text-[10px] font-bold text-slate-300">Contract history</h4>{history.length > 0 && <p className="mt-0.5 text-[10px] text-slate-500">{history[history.length - 1].source} · starts {new Date(history[0].bucket).toLocaleDateString()} · latest sample {stamp(history[history.length - 1].fetchedAt)}</p>}</div><select value={historyMetric} onChange={(event) => setHistoryMetric(event.target.value as "mid" | "iv")} className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-400"><option value="mid">Mid / last price</option><option value="iv">Implied volatility</option></select></div>{historyLoading ? <div className="grid h-36 place-items-center text-[10px] text-slate-500">Loading samples…</div> : historyError ? <p className="text-[10px] text-amber-300">{historyError}</p> : <OptionHistoryChart points={history} metric={historyMetric} />}</div></>}
              </section>
              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4"><h3 className="text-xs font-bold text-white">Expiration payoff</h3><p className="mt-1 text-[10px] text-slate-500">Estimated P/L per share at expiration. Covered calls require an entered share cost basis.</p>{selectedContract && payoff.length > 0 ? <div className="mt-3 h-40"><ResponsiveContainer width="100%" height="100%"><LineChart data={payoff}><CartesianGrid stroke="#334155" strokeDasharray="4 5" /><XAxis dataKey="underlying" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(value: number) => `$${value.toFixed(0)}`} /><YAxis width={50} tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(value: number) => `$${value.toFixed(0)}`} /><Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155", borderRadius: 8, fontSize: 9 }} formatter={(value) => [typeof value === "number" ? cash(value) : "N/A", "P/L per share"]} labelFormatter={(value) => `Underlying ${typeof value === "number" ? cash(value) : String(value)}`} /><ReferenceLine y={0} stroke="#94a3b8" /><Line type="monotone" dataKey="pnl" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <div className="mt-3 grid h-32 place-items-center text-[10px] text-slate-500">Select a contract and provide a basis for calls.</div>}</section>
            </div>
          </div>
        </div>}

        {tab === "Wheel plan" && <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><div className="border-b border-slate-800 p-4"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold text-white">Cash-secured put candidates · highest annualized ROC</h3></div><p className="mt-1 text-[10px] text-slate-500">Uses the scanner&apos;s liquidity, delta, DTE, spread, earnings, and minimum-return rules. Annualized return is a simple extrapolation, not a forecast.</p></div>{!putScan ? <div className="p-6 text-center text-[10px] text-slate-500">{chainLoading ? "Loading put chain…" : "Put candidates unavailable until stock context and a provider chain are available."}</div> : <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-[10px]"><thead className="bg-slate-900 uppercase tracking-wider text-slate-500"><tr>{["Expiration / strike", "Credit", "Annualized ROC", "Break-even", "Cash secured", "Delta / prob. OTM", "Score"].map((heading) => <th key={heading} className="px-3 py-2.5">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{putCandidatesByReturn.slice(0, 40).map((candidate) => <tr key={candidate.contract.symbol} onClick={() => { setSelectedSymbol(candidate.contract.symbol); setTab("Options"); }} className="cursor-pointer hover:bg-slate-800/60"><td className="px-3 py-2.5 font-mono text-white">{candidate.contract.expiration}<div className="text-slate-500">{cash(candidate.contract.strike)} put · {candidate.dte}d</div></td><td className="px-3 py-2.5 font-mono text-emerald-300">{cash(candidate.credit)}</td><td className="px-3 py-2.5 font-mono text-white">{pct(candidate.annRoc)}</td><td className="px-3 py-2.5 font-mono text-slate-300">{cash(candidate.breakeven)}<div className="text-slate-500">{pct(candidate.breakevenCushion)} cushion</div></td><td className="px-3 py-2.5 font-mono text-slate-300">{cash(candidate.cash)}</td><td className="px-3 py-2.5 font-mono text-slate-300">{candidate.contract.delta?.toFixed(2) ?? "N/A"} / {pct(candidate.probOtm)}</td><td className="px-3 py-2.5 font-mono text-cyan-300">{candidate.score.toFixed(0)}</td></tr>)}{putScan.candidates.length === 0 && <tr><td colSpan={7} className="p-7 text-center text-slate-500">No puts meet the scanner&apos;s current liquidity, DTE, delta, spread, earnings, and return rules.</td></tr>}</tbody></table></div>}</section>
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold text-white">Covered-call candidates</h3></div><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Provide your per-share cost basis to evaluate call credit, income on cost, return if called away, and early-assignment risk. Call candidates come from the selected provider chain.</p><div className="mt-3 max-w-xs"><label className="text-[10px] text-slate-500">Share cost basis<input type="number" min="0.01" step="any" value={costBasisInput} onChange={(event) => setCostBasisInput(event.target.value)} className={inputClass + " mt-1"} placeholder="e.g. 100.00" /></label></div></section>
          {!hasCostBasis ? <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">Enter a cost basis to see covered-call candidates.</div> : !callScan ? <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">{chainLoading ? "Loading calls…" : "Calls unavailable until stock context and a provider chain are available."}</div> : <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-[10px]"><thead className="bg-slate-900 uppercase tracking-wider text-slate-500"><tr>{["Expiration / strike", "DTE / delta", "Credit", "Ann. yield on cost", "If called total return", "Upside to strike", "Early assignment", "Score"].map((heading) => <th key={heading} className="px-3 py-2.5">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{callCandidatesByReturn.slice(0, 50).map((candidate) => <tr key={candidate.contract.symbol} onClick={() => { setSelectedSymbol(candidate.contract.symbol); setTab("Options"); }} className="cursor-pointer hover:bg-slate-800/60"><td className="px-3 py-2.5 font-mono text-white">{candidate.contract.expiration}<div className="text-slate-500">{cash(candidate.contract.strike)} call</div></td><td className="px-3 py-2.5 font-mono text-slate-300">{candidate.dte}d / {candidate.contract.delta?.toFixed(2) ?? "N/A"}</td><td className="px-3 py-2.5 font-mono text-emerald-300">{cash(candidate.credit)}</td><td className="px-3 py-2.5 font-mono text-slate-200">{pct(candidate.annYield)}</td><td className="px-3 py-2.5 font-mono text-slate-200">{pct(candidate.ifCalled)}</td><td className="px-3 py-2.5 font-mono text-slate-400">{pct(candidate.upsideToStrike)}</td><td className="px-3 py-2.5">{candidate.earlyAssignmentRisk ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3 w-3" />{candidate.earlyAssignmentRisk}</span> : <span className="text-emerald-300">None identified</span>}</td><td className="px-3 py-2.5 font-mono text-cyan-300">{candidate.score.toFixed(0)}</td></tr>)}{callScan.candidates.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">No calls meet the scanner’s liquidity, DTE, delta, spread, return, and cost-basis rules.</td></tr>}</tbody></table></div></section>}
        </div>}

        <div className="flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-amber-100/70"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />All quotes are informational and may be delayed. Technical indicators describe historical prices; option Greeks may be modeled. Estimated credit assumes a partial-spread fill, excludes fees and slippage, and is not a forecast or recommendation. Confirm current data with your broker before trading.</div>
      </main>
    </div>
  </div>;
}
