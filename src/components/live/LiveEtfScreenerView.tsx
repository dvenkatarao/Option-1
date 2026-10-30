import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, Database, ExternalLink, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import type { ScreenRow } from "../../types/liveScreener";

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

type History = { t: number[]; c: number[]; a: number[]; d: [number, number][] };
type EtfDetail = {
  fund: {
    ticker: string;
    name: string | null;
    category: string | null;
    family: string | null;
    exchange: string | null;
    inceptionDate: string | null;
    expenseRatio: number | null;
    turnover: number | null;
    totalAssets: number | null;
    navPrice: number | null;
    lastClose: number | null;
    lastCloseDate: string | null;
    profile: {
      holdings: { symbol: string | null; name: string; weight: number | null }[];
      sectors: { sector: string; weight: number }[];
    } | null;
    metrics: {
      asOf: string;
      returns: Record<string, { price: number | null; total: number | null; annualised: boolean }>;
      vol3y: number | null;
      maxDrawdown3y: number | null;
      dividends: { ttmYield: number | null; frequency: string; cagr3y: number | null; lastExDate: string | null };
      erosion: { level: string; priceReturnAnn3y: number | null; capitalFundedShare3y: number | null };
    } | null;
    sources: Record<string, string> | null;
    refreshedAt: string | null;
    lastError: string | null;
  };
  history: History | null;
  quote: { price: number | null; changePct: number | null; marketState?: string } | null;
  quoteFetchedAt: string | null;
  quoteStale: boolean;
  technical: { asOf: string | null; bars: number; price: number | null; sma50: number | null; sma200: number | null; rsi14: number | null; state: "uptrend" | "downtrend" | "mixed" | "insufficient"; rsiState: "oversold" | "neutral" | "overbought" | "unavailable"; aboveSma50: boolean | null; aboveSma200: boolean | null; movingAverageAlignment: "50d-above-200d" | "50d-below-200d" | null; methodology: string };
  takeaway: { headline: string; detail: string; suitable: string; watch: string; tone: "good" | "caution" | "warn"; context: { historyAsOf: string | null; quoteFetchedAt: string | null; sources: string[] } } | null;
  analyst: { consensus: { recMean: number | null; upside: number | null; coverageWeight: number; recCoverageWeight?: number; upsideCoverageWeight?: number; counted: number; listed: number }; items: { symbol: string; name: string; weight: number; recKey: string | null; upside: number | null }[] } | null;
  news: { title: string; link: string; date: string | null; source: string; summary: string | null }[];
  newsFetchedAt: string | null;
  newsStale: boolean;
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

function ReturnChart({ history }: { history: History | null }) {
  const chart = useMemo(() => {
    if (!history || history.c.length < 2 || history.a.length < 2) return null;
    const start = Math.max(0, history.c.length - 252);
    const close = history.c.slice(start);
    const adjusted = history.a.slice(start);
    if (close.length < 2 || adjusted.length !== close.length || !close[0] || !adjusted[0]) return null;
    const series = [close.map((v) => (v / close[0]) * 100), adjusted.map((v) => (v / adjusted[0]) * 100)];
    const all = series.flat();
    const low = Math.min(...all);
    const high = Math.max(...all);
    const range = high - low || 1;
    const points = (values: number[]) => values.map((v, i) => `${(i / (values.length - 1)) * 600},${102 - ((v - low) / range) * 92}`).join(" ");
    return { price: points(series[0]), total: points(series[1]), low, high };
  }, [history]);

  if (!chart) return <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500">Price history is not available yet.</div>;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-slate-200">Trailing 1Y · normalized to 100</h4>
          <p className="mt-1 text-[10px] text-slate-500">Price return vs. distribution-adjusted total return</p>
        </div>
        <div className="flex gap-3 text-[10px]">
          <span className="text-cyan-300">— Price</span><span className="text-emerald-400">— Total return</span>
        </div>
      </div>
      <svg viewBox="0 0 600 110" className="h-36 w-full" role="img" aria-label="Price and total-return history">
        <line x1="0" y1="102" x2="600" y2="102" stroke="#1e293b" />
        <line x1="0" y1="55" x2="600" y2="55" stroke="#1e293b" strokeDasharray="4 5" />
        <polyline points={chart.price} fill="none" stroke="#67e8f9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={chart.total} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500"><span>100 baseline</span><span>Index range {chart.low.toFixed(0)}–{chart.high.toFixed(0)}</span></div>
    </div>
  );
}

function EtfDetail({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [detail, setDetail] = useState<EtfDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      requestJson<EtfDetail>(`/api/etfs/${encodeURIComponent(ticker)}`)
        .then((data) => { if (active) setDetail(data); })
        .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "ETF detail request failed"); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [ticker]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`${ticker} live ETF details`}>
      <div className="mx-auto my-4 max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:my-8 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400"><Activity className="h-3.5 w-3.5" /> Source-backed ETF dossier</div>
            <h3 className="mt-2 font-mono text-2xl font-extrabold text-white">{ticker}{detail?.fund.name ? <span className="ml-3 font-sans text-base font-semibold text-slate-300">{detail.fund.name}</span> : null}</h3>
            <p className="mt-1 text-xs text-slate-500">Data refreshed {stamp(detail?.fund.refreshedAt)}{detail?.quoteStale ? " · quote is stale" : ""}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close ETF details"><X className="h-4 w-4" /></button>
        </div>
        {loading ? <div className="py-12 text-center text-sm text-slate-400">Loading stored history and provider details…</div> : error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : detail && (
          <div className="space-y-5">
            {detail.fund.lastError && <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Latest refresh failed: {detail.fund.lastError}. Previously stored metrics remain unchanged.</div>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <Metric label="Last price" value={money(detail.quote?.price ?? detail.fund.lastClose)} hint={detail.fund.lastCloseDate ?? undefined} />
              <Metric label="Expense ratio" value={pct(detail.fund.expenseRatio)} />
              <Metric label="TTM yield" value={pct(detail.fund.metrics?.dividends.ttmYield ?? null)} hint={detail.fund.metrics?.dividends.frequency ?? undefined} />
              <Metric label="AUM" value={aum(detail.fund.totalAssets)} />
              <Metric label="3Y total return" value={pct(detail.fund.metrics?.returns["3Y"]?.total ?? null)} />
              <Metric label="3Y max drawdown" value={pct(detail.fund.metrics?.maxDrawdown3y ?? null)} />
              <Metric label="3Y volatility" value={pct(detail.fund.metrics?.vol3y ?? null)} />
              <Metric label="NAV erosion proxy" value={detail.fund.metrics?.erosion.level ?? "N/A"} hint={`Price return ${pct(detail.fund.metrics?.erosion.priceReturnAnn3y ?? null)}`} />
              <Metric label="3Y distribution CAGR" value={pct(detail.fund.metrics?.dividends.cagr3y ?? null)} />
              <Metric label="Inception" value={detail.fund.inceptionDate ?? "N/A"} />
              <Metric label="NAV (provider)" value={money(detail.fund.navPrice)} />
              <Metric label="Last ex-date" value={detail.fund.metrics?.dividends.lastExDate ?? "N/A"} />
            </div>
            {detail.takeaway && <section className={`rounded-xl border p-4 ${detail.takeaway.tone === "warn" ? "border-rose-500/30 bg-rose-500/5" : detail.takeaway.tone === "caution" ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Plain-English ETF takeaway</h4><span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[9px] text-slate-400">rules-based, not personalized</span></div>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-100">{detail.takeaway.headline}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{detail.takeaway.detail}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Heuristic context</div><p className="mt-1 text-xs leading-relaxed text-slate-300">{detail.takeaway.suitable}</p></div><div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">What to watch</div><p className="mt-1 text-xs leading-relaxed text-slate-300">{detail.takeaway.watch}</p></div></div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">Source context: {detail.takeaway.context.sources.join(" · ") || "provider metadata unavailable"}. Price history as of {detail.takeaway.context.historyAsOf ?? "N/A"}; quote fetched {stamp(detail.takeaway.context.quoteFetchedAt)}.</p>
            </section>}
            <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Deterministic trend signals</h4><p className="mt-1 text-[10px] text-slate-500">Stored daily price history · as of {detail.technical.asOf ?? "N/A"} · {detail.technical.bars} valid bars</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${detail.technical.state === "uptrend" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : detail.technical.state === "downtrend" ? "border-rose-500/20 bg-rose-500/10 text-rose-300" : "border-amber-500/20 bg-amber-500/10 text-amber-200"}`}>{detail.technical.state}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Last split-adjusted close" value={money(detail.technical.price)} hint={detail.technical.aboveSma50 == null ? "Not enough history" : detail.technical.aboveSma50 ? "Above 50-day average" : "At/below 50-day average"} /><Metric label="SMA 50" value={money(detail.technical.sma50)} /><Metric label="SMA 200" value={money(detail.technical.sma200)} hint={detail.technical.movingAverageAlignment ?? "Requires 200 closes"} /><Metric label="RSI 14" value={detail.technical.rsi14?.toFixed(1) ?? "N/A"} hint={detail.technical.rsiState} /></div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{detail.technical.methodology}</p>
            </section>
            <ReturnChart history={detail.history} />
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">Top holdings & sector mix</h4>
                {detail.fund.profile?.holdings?.length ? <div className="space-y-2">{detail.fund.profile.holdings.slice(0, 8).map((holding, index) => <div key={`${holding.symbol}-${index}`} className="flex items-center justify-between gap-4 text-xs"><span className="truncate text-slate-300">{holding.symbol || holding.name || "Unreported holding"}</span><span className="font-mono text-slate-400">{pct(holding.weight)}</span></div>)}</div> : <p className="text-xs text-slate-500">Holdings weights are not reported.</p>}
                {detail.fund.profile?.sectors?.length ? <div className="mt-4 border-t border-slate-800 pt-3"><div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Sector weights · provider-reported</div><div className="flex flex-wrap gap-2">{detail.fund.profile.sectors.slice(0, 8).map((sector) => <span key={sector.sector} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] text-slate-300">{sector.sector} {pct(sector.weight)}</span>)}</div></div> : null}
              </section>
              <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">Holdings-weighted analyst view</h4>
                {detail.analyst ? <><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Recommendation mean" value={detail.analyst.consensus.recMean?.toFixed(2) ?? "N/A"} hint="1=strong buy · 5=sell" /><Metric label="Target upside" value={pct(detail.analyst.consensus.upside)} /><Metric label="Rec. data coverage" value={pct(detail.analyst.consensus.recCoverageWeight)} /><Metric label="Target data coverage" value={pct(detail.analyst.consensus.upsideCoverageWeight)} /></div><p className="mt-2 text-[10px] text-slate-500">Analyst data for {detail.analyst.consensus.counted}/{detail.analyst.consensus.listed} listed holdings; recommendation coverage is the share of listed top-holdings weight with a stock-level recommendation. Not an ETF-level recommendation.</p></> : <p className="text-xs text-slate-500">No holdings-level analyst data is available.</p>}
                <div className="mt-4 border-t border-slate-800 pt-3"><h5 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Recent headlines</h5>{detail.news.length ? <div className="space-y-2">{detail.news.slice(0, 4).map((item, index) => <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 text-xs text-slate-300 hover:text-emerald-300"><span className="line-clamp-2">{item.title}</span><ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" /></a>)}</div> : <p className="text-xs text-slate-500">No headlines available.</p>}</div>
              </section>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">Sources: {Object.values(detail.fund.sources ?? {}).join(" · ") || "Provider source not recorded"}. Quote as of {stamp(detail.quoteFetchedAt)}. NAV erosion is a market-price proxy, not a sponsor return-of-capital determination.</p>
          </div>
        )}
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
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await requestJson<ScreenerResponse>(`/api/etfs${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ETF data could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const result = await requestJson<{ processed: { ticker: string; ok: boolean; error?: string }[]; remaining: number }>("/api/etfs/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 8 }),
      });
      const ok = result.processed.filter((item) => item.ok).length;
      setMessage(`Refreshed ${ok} ETF${ok === 1 ? "" : "s"}; ${result.remaining} remain in the hydration queue.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh could not be completed");
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
    } catch (e) {
      setDiscoveryError(e instanceof Error ? e.message : "ETF universe discovery failed");
    } finally {
      setDiscovering(false);
    }
  };

  const filteredRows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 p-5 shadow-xl sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400"><Database className="h-4 w-4" /> Provider-backed ETF universe</div>
            <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">Live Research Screener</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">10-year price and distribution history, deterministic return/risk metrics, fund quality grading, and delayed quotes. Missing values stay N/A; stored values show their refresh date.</p>
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
        <div className="mt-3 text-[10px] text-slate-500">Quote cache {stamp(data?.refreshedAt)}{data?.stale ? " · stale-on-error copy" : ""} · Yahoo Finance delayed feed is unofficial.</div>
      </section>

      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{message}</div>}
      {discoveryError && <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{discoveryError}</span></div>}
      {error && <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}. For persistent data, configure PostgreSQL with DATABASE_URL and run <code className="rounded bg-slate-950 px-1 py-0.5">npm run db:migrate</code> (or use the included Docker Compose setup).</span></div>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker, name, category…" className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-emerald-500/60" /></div>
        {data && <span className="text-[11px] text-slate-500">Showing {filteredRows.length} stored fund records · sorted by universe refresh order</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl">
        <div className="max-h-[65vh] overflow-auto">
          <table className="min-w-[1080px] w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Fund", "Category", "Quality", "Price", "Expense", "Yield TTM", "AUM", "YTD", "1Y", "3Y ann.", "Max DD 3Y", "NAV erosion"].map((label) => <th key={label} className="border-b border-slate-800 px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading && !data ? <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-400">Loading source-backed screener…</td></tr> : filteredRows.map((row) => (
                <tr key={row.ticker} className="transition hover:bg-slate-800/50">
                  <td className="px-3 py-2.5"><button onClick={() => setSelectedTicker(row.ticker)} className="text-left"><span className="flex items-center gap-1.5"><span className="font-mono font-bold text-emerald-300 hover:text-emerald-200">{row.ticker}</span>{row.leveraged && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">Leveraged / inverse</span>}</span><span className="mt-0.5 block max-w-56 truncate text-[10px] text-slate-500">{row.name ?? "Fund name unavailable"}</span></button></td>
                  <td className="max-w-44 truncate px-3 py-2.5 text-slate-400">{row.category ?? "N/A"}</td>
                  <td className="px-3 py-2.5">{row.quality ? <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono font-bold text-emerald-300">{row.quality}{row.qualityScore != null ? ` · ${row.qualityScore.toFixed(0)}` : ""}</span> : <span className="text-slate-500">N/A</span>}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-200">{money(row.price)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{pct(row.expense)}</td>
                  <td className="px-3 py-2.5 font-mono text-emerald-300">{pct(row.yieldTtm)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{aum(row.aum)}</td>
                  <td className={`px-3 py-2.5 font-mono ${row.ytd != null && row.ytd < 0 ? "text-rose-300" : "text-slate-300"}`}>{pct(row.ytd)}</td>
                  <td className={`px-3 py-2.5 font-mono ${row.r1y != null && row.r1y < 0 ? "text-rose-300" : "text-slate-300"}`}>{pct(row.r1y)}</td>
                  <td className={`px-3 py-2.5 font-mono ${row.r3y != null && row.r3y < 0 ? "text-rose-300" : "text-slate-300"}`}>{pct(row.r3y)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{pct(row.dd3y)}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full border px-2 py-1 text-[10px] ${row.erosion === "Severe" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : row.erosion === "Moderate" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-950 text-slate-400"}`}>{row.erosion}</span></td>
                </tr>
              ))}
              {!loading && data && filteredRows.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-xs text-slate-500">{data.hydrated === 0 ? `No ETF records stored yet. ${data.remaining} universe tickers are queued for refresh.` : "No stored funds match this search."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <details className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-300">Metric definitions & data integrity <ChevronDown className="h-4 w-4 text-slate-500" /></summary>
        <div className="mt-3 grid gap-2 leading-relaxed sm:grid-cols-2"><p><b className="text-slate-200">Returns:</b> total return uses distribution-adjusted history; periods over one year are annualized.</p><p><b className="text-slate-200">NAV erosion:</b> proxy from price return while distributions are paid; it is not an official return-of-capital measure.</p><p><b className="text-slate-200">Quality:</b> product construction grade, not a forecast or performance rating.</p><p><b className="text-slate-200">Missing values:</b> provider gaps remain N/A. Failed refreshes do not overwrite stored good data.</p></div>
      </details>

      {selectedTicker && <EtfDetail key={selectedTicker} ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />}
    </div>
  );
}
