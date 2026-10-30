"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ExternalLink, ShieldAlert, ShieldCheck, X } from "lucide-react";
import type { ScreenRow } from "@/types/liveScreener";

type History = { t: number[]; c: number[]; a: number[]; d: [number, number][] };
type PeriodReturn = { price: number | null; total: number | null; annualised: boolean };
export type LiveEtfDetailResponse = {
  fund: {
    ticker: string;
    name: string | null;
    category: string | null;
    family: string | null;
    exchange: string | null;
    instrumentType: string | null;
    inceptionDate: string | null;
    expenseRatio: number | null;
    turnover: number | null;
    totalAssets: number | null;
    navPrice: number | null;
    beta3y: number | null;
    lastClose: number | null;
    lastCloseDate: string | null;
    profile: {
      holdings: { symbol: string | null; name: string; weight: number | null }[];
      sectors: { sector: string; weight: number }[];
      allocation: { stock: number | null; bond: number | null; cash: number | null; other: number | null };
    } | null;
    metrics: {
      asOf: string;
      firstBar: string;
      bars: number;
      returns: Record<string, PeriodReturn>;
      vol1y: number | null;
      vol3y: number | null;
      maxDrawdown3y: number | null;
      maxDrawdown5y: number | null;
      high52w: number | null;
      low52w: number | null;
      dividends: {
        ttmAmount: number | null;
        ttmYield: number | null;
        ttmCount: number;
        frequency: string;
        lastAmount: number | null;
        lastExDate: string | null;
        growth1y: number | null;
        cagr3y: number | null;
        cagr5y: number | null;
      };
      erosion: {
        level: string;
        priceReturnAnn1y: number | null;
        priceReturnAnn3y: number | null;
        priceReturnAnn5y: number | null;
        capitalFundedShare3y: number | null;
      };
    } | null;
    sources: Record<string, string> | null;
    refreshedAt: string | null;
    lastError: string | null;
  };
  history: History | null;
  quote: { price: number | null; changePct: number | null; marketState?: string } | null;
  quoteFetchedAt: string | null;
  quoteStale: boolean;
  technical: {
    asOf: string | null;
    bars: number;
    price: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi14: number | null;
    state: "uptrend" | "downtrend" | "mixed" | "insufficient";
    rsiState: "oversold" | "neutral" | "overbought" | "unavailable";
    aboveSma50: boolean | null;
    aboveSma200: boolean | null;
    movingAverageAlignment: "50d-above-200d" | "50d-below-200d" | null;
    methodology: string;
  };
  takeaway: {
    headline: string;
    detail: string;
    suitable: string;
    watch: string;
    tone: "good" | "caution" | "warn";
    context: { historyAsOf: string | null; quoteFetchedAt: string | null; sources: string[] };
  } | null;
  analyst: {
    consensus: {
      recMean: number | null;
      upside: number | null;
      coverageWeight: number;
      recCoverageWeight?: number;
      upsideCoverageWeight?: number;
      counted: number;
      listed: number;
    };
    items: { symbol: string; name: string; weight: number; recKey: string | null; upside: number | null }[];
  } | null;
  news: { title: string; link: string; date: string | null; source: string; summary: string | null }[];
  newsFetchedAt: string | null;
  newsStale: boolean;
};

type Tab = "overview" | "holdings" | "dividends" | "profile" | "risk";

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

async function requestJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${response.status})`);
  return data as T;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-1 block font-mono text-sm font-bold text-slate-100">{value}</span>
      {hint && <span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">{title}</h4>
      {children}
    </section>
  );
}

function ReturnChart({ history }: { history: History | null }) {
  const chart = useMemo(() => {
    if (!history || history.c.length < 2 || history.a.length < 2) return null;
    const start = Math.max(0, history.c.length - 252);
    const close = history.c.slice(start);
    const adjusted = history.a.slice(start);
    if (close.length < 2 || adjusted.length !== close.length || !close[0] || !adjusted[0]) return null;
    const series = [close.map((value) => value / close[0] * 100), adjusted.map((value) => value / adjusted[0] * 100)];
    const all = series.flat();
    const low = Math.min(...all);
    const high = Math.max(...all);
    const range = high - low || 1;
    const points = (values: number[]) => values.map((value, index) => `${(index / (values.length - 1)) * 600},${102 - ((value - low) / range) * 92}`).join(" ");
    return { price: points(series[0]), total: points(series[1]), low, high };
  }, [history]);

  if (!chart) return <div className="grid h-40 place-items-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">Price history is not available yet.</div>;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><h5 className="text-xs font-bold text-slate-200">Trailing 1Y · normalized to 100</h5><p className="mt-1 text-[10px] text-slate-500">Price return vs. distribution-adjusted total return</p></div>
        <div className="flex gap-3 text-[10px]"><span className="text-cyan-300">— Price</span><span className="text-emerald-400">— Total return</span></div>
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

function TabButton({ id, active, onClick, children }: { id: Tab; active: Tab; onClick: (tab: Tab) => void; children: ReactNode }) {
  return (
    <button onClick={() => onClick(id)} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold transition ${active === id ? "border-emerald-400 text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
      {children}
    </button>
  );
}

export function LiveEtfDetailModal({
  row,
  onClose,
  isCompared,
  compareLimitReached,
  onToggleCompare,
  onOpenCompare,
}: {
  row: ScreenRow;
  onClose: () => void;
  isCompared: boolean;
  compareLimitReached: boolean;
  onToggleCompare: (row: ScreenRow) => void;
  onOpenCompare: () => void;
}) {
  const [detail, setDetail] = useState<LiveEtfDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    const controller = new AbortController();
    requestJson<LiveEtfDetailResponse>(`/api/etfs/${encodeURIComponent(row.ticker)}`, controller.signal)
      .then((response) => { if (!controller.signal.aborted) setDetail(response); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "ETF detail request failed");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [row.ticker]);

  const fund = detail?.fund;
  const metrics = fund?.metrics;
  const erosion = metrics?.erosion;
  const distributions = detail?.history?.d.slice(-12).reverse() ?? [];
  const quote = detail?.quote;
  const profile = fund?.profile;
  const allocation = profile?.allocation;
  const sourceNames = Object.values(fund?.sources ?? {}).filter(Boolean);
  const price = quote?.price ?? fund?.lastClose ?? row.price;
  const change = quote?.changePct ?? row.changePct;
  const lastExDate = metrics?.dividends.lastExDate ?? row.lastExDate;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="relative mx-auto my-4 flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:my-8" role="dialog" aria-modal="true" aria-label={`${row.ticker} live ETF details`}>
        <header className="flex flex-col justify-between gap-4 border-b border-slate-800 bg-slate-950 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 min-w-16 items-center justify-center rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 px-2 font-mono text-lg font-extrabold text-emerald-300">{row.ticker}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-extrabold text-white sm:text-2xl">{fund?.name ?? row.name ?? row.ticker}</h2><span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 font-mono text-[10px] text-slate-300">{fund?.family ?? row.family ?? "Provider family N/A"}</span></div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span>Category: <b className="text-emerald-300">{fund?.category ?? row.category ?? "N/A"}</b></span>
                <span>AUM: <b className="text-slate-100">{aum(fund?.totalAssets ?? row.aum)}</b></span>
                <span>Expense: <b className="text-slate-100">{pct(fund?.expenseRatio ?? row.expense)}</b></span>
                <span>Data as of: <b className="text-slate-200">{metrics?.asOf ?? "N/A"}</b></span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
            <button onClick={() => onToggleCompare(row)} disabled={compareLimitReached} title={compareLimitReached ? "Remove a selected fund from the live compare list before adding another" : "Add this live ETF to the comparison"} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isCompared ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />{isCompared ? "In Compare List" : compareLimitReached ? "Compare list full" : "+ Add to Compare"}
            </button>
            {isCompared && <button onClick={onOpenCompare} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-500">Launch Compare</button>}
            <button onClick={onClose} className="ml-1 rounded-lg bg-slate-800 p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-white" aria-label="Close live ETF details"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] leading-relaxed text-cyan-100/80 sm:mx-5">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <span>Provider-backed data only. Quotes may be delayed and stale on provider errors. Quality is a rules-based product-construction grade, not a Morningstar or analyst rating; NAV erosion is a market-price proxy, not an official return-of-capital determination.</span>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-800 bg-slate-950/60 p-4 text-xs font-mono sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3"><span className="block text-[10px] text-slate-400">Provider price</span><strong className="mt-1 block text-base text-white">{money(price)}</strong><span className={`mt-0.5 block text-[10px] ${change != null && change < 0 ? "text-rose-400" : "text-emerald-400"}`}>{change == null ? "Change N/A" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}% today`}</span></div>
          <Metric label="TTM yield" value={pct(metrics?.dividends.ttmYield ?? row.yieldTtm)} hint={metrics?.dividends.frequency ?? row.freq} />
          <Metric label="Last ex-date" value={dateLabel(lastExDate)} hint="Most recent distribution event; not the next scheduled date" />
          <Metric label="Quality grade" value={row.quality ? `${row.quality}${row.qualityScore == null ? "" : ` · ${row.qualityScore.toFixed(0)}`}` : "N/A"} hint="Rules-based product-quality heuristic" />
          <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3"><span className="block text-[10px] text-slate-400">NAV erosion proxy</span><div className="mt-1 flex items-center gap-1.5">{erosion?.level === "None" || erosion?.level === "Mild" ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-amber-400" />}<strong className="text-sm text-white">{erosion?.level ?? row.erosion}</strong></div><span className="mt-0.5 block text-[10px] text-slate-400">3Y price trend proxy</span></div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900 px-3" aria-label="Live ETF detail sections">
          <TabButton id="overview" active={activeTab} onClick={setActiveTab}>NAV vs Total Return</TabButton>
          <TabButton id="holdings" active={activeTab} onClick={setActiveTab}>Holdings & Sector Weights</TabButton>
          <TabButton id="dividends" active={activeTab} onClick={setActiveTab}>Dividends & Ex-Date Timeline</TabButton>
          <TabButton id="profile" active={activeTab} onClick={setActiveTab}>Fund Profile & Exposure</TabButton>
          <TabButton id="risk" active={activeTab} onClick={setActiveTab}>Risk Ratios & Analyst View</TabButton>
        </nav>

        <main className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {loading && <div className="py-12 text-center text-sm text-slate-400">Loading stored price history and provider details…</div>}
          {error && <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {fund?.lastError && <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Latest refresh failed: {fund.lastError}. Previously stored good data is retained.</div>}

          {!loading && !error && detail && activeTab === "overview" && <div className="space-y-4">
            {detail.takeaway && <section className={`rounded-xl border p-4 ${detail.takeaway.tone === "warn" ? "border-rose-500/30 bg-rose-500/5" : detail.takeaway.tone === "caution" ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
              <div className="flex flex-wrap items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Plain-English ETF takeaway</h3><span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[9px] text-slate-400">rules-based, not personalized</span></div>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-100">{detail.takeaway.headline}</p><p className="mt-2 text-xs leading-relaxed text-slate-400">{detail.takeaway.detail}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Heuristic context</div><p className="mt-1 text-xs leading-relaxed text-slate-300">{detail.takeaway.suitable}</p></div><div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">What to watch</div><p className="mt-1 text-xs leading-relaxed text-slate-300">{detail.takeaway.watch}</p></div></div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">Sources: {detail.takeaway.context.sources.join(" · ") || "provider metadata unavailable"}. History as of {detail.takeaway.context.historyAsOf ?? "N/A"}; quote fetched {stamp(detail.takeaway.context.quoteFetchedAt)}.</p>
            </section>}
            <Section title="Distribution-adjusted performance & drawdown">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                <Metric label="YTD total return" value={pct(metrics?.returns.YTD?.total)} />
                <Metric label="1Y total return" value={pct(metrics?.returns["1Y"]?.total)} />
                <Metric label="3Y total return (ann.)" value={pct(metrics?.returns["3Y"]?.total)} />
                <Metric label="5Y total return (ann.)" value={pct(metrics?.returns["5Y"]?.total)} />
                <Metric label="3Y max drawdown" value={pct(metrics?.maxDrawdown3y)} />
                <Metric label="3Y volatility" value={pct(metrics?.vol3y)} />
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">Total returns use distribution-adjusted daily history. Multi-year values are annualized when the stored history covers the full period. Metrics as of {metrics?.asOf ?? "N/A"}.</p>
            </Section>
            <ReturnChart history={detail.history} />
            <Section title="NAV erosion proxy · not an official return-of-capital measure">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Proxy level" value={erosion?.level ?? "N/A"} /><Metric label="1Y annualized price return" value={pct(erosion?.priceReturnAnn1y)} /><Metric label="3Y annualized price return" value={pct(erosion?.priceReturnAnn3y)} /><Metric label="Share of distributions potentially capital-funded" value={pct(erosion?.capitalFundedShare3y)} hint="Heuristic estimate from market price return and distributions" /></div>
            </Section>
          </div>}

          {!loading && !error && detail && activeTab === "holdings" && <div className="grid gap-4 lg:grid-cols-2">
            <Section title={`Top holdings · ${profile?.holdings.length ?? 0} reported`}>
              {profile?.holdings.length ? <div className="divide-y divide-slate-800">{profile.holdings.slice(0, 15).map((holding, index) => <div key={`${holding.symbol}-${index}`} className="flex items-center justify-between gap-4 py-2.5 text-xs"><div className="min-w-0"><span className="font-mono font-bold text-emerald-300">{holding.symbol || "—"}</span><span className="ml-2 truncate text-slate-400">{holding.name || "Name not reported"}</span></div><span className="shrink-0 font-mono text-slate-300">{pct(holding.weight)}</span></div>)}</div> : <p className="text-xs text-slate-500">Provider holdings are not reported.</p>}
            </Section>
            <Section title="Sector weights · provider-reported">
              {profile?.sectors.length ? <div className="space-y-2">{profile.sectors.slice(0, 12).map((sector) => <div key={sector.sector} className="flex items-center justify-between gap-4 text-xs"><span className="text-slate-300">{sector.sector}</span><span className="font-mono text-slate-400">{pct(sector.weight)}</span></div>)}</div> : <p className="text-xs text-slate-500">Sector weights are not reported.</p>}
            </Section>
          </div>}

          {!loading && !error && detail && activeTab === "dividends" && <div className="space-y-4">
            <Section title="Provider distributions & ex-date context">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"><Metric label="TTM yield" value={pct(metrics?.dividends.ttmYield)} /><Metric label="TTM distributions / share" value={money(metrics?.dividends.ttmAmount)} /><Metric label="Payout frequency" value={metrics?.dividends.frequency ?? "N/A"} /><Metric label="3Y distribution CAGR" value={pct(metrics?.dividends.cagr3y)} /><Metric label="5Y distribution CAGR" value={pct(metrics?.dividends.cagr5y)} hint="Requires six years of stored distribution history" /><Metric label="1Y distribution growth" value={pct(metrics?.dividends.growth1y)} /><Metric label="Last ex-date" value={dateLabel(lastExDate)} /><Metric label="Last distribution / share" value={money(metrics?.dividends.lastAmount)} /><Metric label="TTM event count" value={String(metrics?.dividends.ttmCount ?? "N/A")} /></div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">The shown ex-date is the most recent historical distribution event from stored provider history; it is not the next scheduled payment date. Distribution CAGRs compare rolling 12-month totals and remain N/A when history is insufficient.</p>
            </Section>
            <Section title="Recent distribution events · up to 12 most recent">
              {distributions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="border-b border-slate-800 px-3 py-2">Ex-date</th><th className="border-b border-slate-800 px-3 py-2 text-right">Amount / share</th><th className="border-b border-slate-800 px-3 py-2 text-right">Event</th></tr></thead><tbody className="divide-y divide-slate-800/80">{distributions.map(([timestamp, amount], index) => <tr key={`${timestamp}-${index}`}><td className="px-3 py-2.5 font-mono text-cyan-200"><span className="inline-flex items-center gap-2"><CalendarDays className="h-3 w-3 text-slate-500" />{dateLabel(new Date(timestamp * 1000).toISOString())}</span></td><td className="px-3 py-2.5 text-right font-mono text-slate-200">{money(amount, 4)}</td><td className="px-3 py-2.5 text-right text-slate-500">Provider history</td></tr>)}</tbody></table></div> : <p className="text-xs text-slate-500">No distribution events are available in the stored history.</p>}
            </Section>
          </div>}

          {!loading && !error && detail && activeTab === "profile" && <div className="space-y-4">
            <Section title="Fund facts · provider metadata">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"><Metric label="Category" value={fund?.category ?? "N/A"} /><Metric label="Fund family" value={fund?.family ?? "N/A"} /><Metric label="Exchange" value={fund?.exchange ?? "N/A"} /><Metric label="Instrument type" value={fund?.instrumentType ?? "N/A"} /><Metric label="Inception" value={fund?.inceptionDate ?? "N/A"} /><Metric label="Expense ratio" value={pct(fund?.expenseRatio)} /><Metric label="Holdings turnover" value={pct(fund?.turnover)} /><Metric label="Total assets" value={aum(fund?.totalAssets)} /><Metric label="Provider NAV" value={money(fund?.navPrice)} /><Metric label="3Y beta" value={fund?.beta3y == null ? "N/A" : fund.beta3y.toFixed(2)} /><Metric label="Latest close date" value={fund?.lastCloseDate ?? "N/A"} /><Metric label="Source refresh" value={stamp(fund?.refreshedAt)} /></div>
            </Section>
            <Section title="Exposure & classification">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"><Metric label="Asset class" value={row.assetClass} /><Metric label="Rate sensitivity" value={row.rateLabel} /><Metric label="Leveraged / inverse" value={row.leveraged ? "Provider/name flagged" : "Not flagged"} /><Metric label="Quality grade" value={row.quality ? `${row.quality}${row.qualityScore == null ? "" : ` · ${row.qualityScore.toFixed(0)}`}` : "N/A"} hint="Rules-based grade; not a fund rating" /><Metric label="Quote state" value={detail.quoteStale ? "Stale / cached" : quote?.marketState ?? "Current cache"} hint={`Fetched ${stamp(detail.quoteFetchedAt)}`} /></div>
              {allocation && <div className="mt-3 flex flex-wrap gap-2">{(["stock", "bond", "cash", "other"] as const).map((key) => <span key={key} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[10px] text-slate-300">{key}: {pct(allocation[key])}</span>)}</div>}
            </Section>
          </div>}

          {!loading && !error && detail && activeTab === "risk" && <div className="space-y-4">
            <Section title="Risk ratios & deterministic trend signals">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Max drawdown 3Y" value={pct(metrics?.maxDrawdown3y)} /><Metric label="Max drawdown 5Y" value={pct(metrics?.maxDrawdown5y)} /><Metric label="Volatility 1Y" value={pct(metrics?.vol1y)} /><Metric label="Volatility 3Y" value={pct(metrics?.vol3y)} /><Metric label="Sharpe 3Y" value={row.sharpe?.toFixed(2) ?? "N/A"} hint="Based on the stored risk-free proxy" /><Metric label="Quality coverage" value={row.qualityScore == null ? "N/A" : `${row.qualityScore.toFixed(0)}/100`} hint="Not an analyst or Morningstar rating" /></div>
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h5 className="text-xs font-bold uppercase tracking-wider text-slate-300">Moving-average & RSI context</h5><p className="mt-1 text-[10px] text-slate-500">Stored daily history · as of {detail.technical.asOf ?? "N/A"} · {detail.technical.bars} valid bars</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-200">{detail.technical.state}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Last adjusted close" value={money(detail.technical.price)} hint={detail.technical.aboveSma50 == null ? "Not enough history" : detail.technical.aboveSma50 ? "Above 50-day average" : "At/below 50-day average"} /><Metric label="SMA 50" value={money(detail.technical.sma50)} /><Metric label="SMA 200" value={money(detail.technical.sma200)} hint={detail.technical.movingAverageAlignment ?? "Requires 200 closes"} /><Metric label="RSI 14" value={detail.technical.rsi14?.toFixed(1) ?? "N/A"} hint={detail.technical.rsiState} /></div>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{detail.technical.methodology}</p>
              </div>
            </Section>
            <Section title="Holdings-weighted analyst context · not an ETF-level rating">
              {detail.analyst ? <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Recommendation mean" value={detail.analyst.consensus.recMean?.toFixed(2) ?? "N/A"} hint="1=strong buy · 5=sell" /><Metric label="Target upside" value={pct(detail.analyst.consensus.upside)} /><Metric label="Recommendation coverage" value={pct(detail.analyst.consensus.recCoverageWeight)} /><Metric label="Target coverage" value={pct(detail.analyst.consensus.upsideCoverageWeight)} /></div>
                <p className="mt-2 text-[10px] text-slate-500">Coverage spans {detail.analyst.consensus.counted}/{detail.analyst.consensus.listed} listed holdings. Values are holdings-weighted stock-level analyst data, not an ETF recommendation.</p>
                {detail.analyst.items.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="border-b border-slate-800 px-3 py-2">Holding</th><th className="border-b border-slate-800 px-3 py-2 text-right">Fund weight</th><th className="border-b border-slate-800 px-3 py-2">Recommendation</th><th className="border-b border-slate-800 px-3 py-2 text-right">Target upside</th></tr></thead><tbody className="divide-y divide-slate-800/80">{detail.analyst.items.slice(0, 12).map((item) => <tr key={item.symbol}><td className="px-3 py-2 font-mono text-emerald-300">{item.symbol} <span className="font-sans text-slate-500">{item.name}</span></td><td className="px-3 py-2 text-right font-mono text-slate-300">{pct(item.weight)}</td><td className="px-3 py-2 text-slate-400">{item.recKey ?? "N/A"}</td><td className="px-3 py-2 text-right font-mono text-slate-300">{pct(item.upside)}</td></tr>)}</tbody></table></div>}
              </> : <p className="text-xs text-slate-500">No holdings-level analyst data is available.</p>}
            </Section>
            <Section title="Recent headlines">
              {detail.news.length ? <div className="space-y-3">{detail.news.slice(0, 8).map((item, index) => <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300 hover:border-emerald-500/30 hover:text-emerald-200"><span><span className="block leading-relaxed">{item.title}</span><span className="mt-1 block text-[10px] text-slate-500">{item.source}{item.date ? ` · ${dateLabel(item.date)}` : ""}{item.summary ? ` · ${item.summary}` : ""}</span></span><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /></a>)}</div> : <p className="text-xs text-slate-500">No headlines available.</p>}
              <p className="mt-3 text-[10px] text-slate-500">News cache {stamp(detail.newsFetchedAt)}{detail.newsStale ? " · stale" : ""}</p>
            </Section>
          </div>}

          {detail && <footer className="border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-slate-500">Sources: {sourceNames.join(" · ") || "Provider source not recorded"}. Price history as of {metrics?.asOf ?? "N/A"}; quote fetched {stamp(detail.quoteFetchedAt)}{detail.quoteStale ? " · stale-on-error data" : ""}.</footer>}
        </main>
      </div>
    </div>
  );
}
