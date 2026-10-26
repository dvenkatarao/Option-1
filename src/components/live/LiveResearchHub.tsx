import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, BookOpen, Check, CircleHelp, Download, ExternalLink, Gauge, Layers3, Newspaper, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import type { ScreenRow } from "../../types/liveScreener";

type HubTab = "macro" | "news" | "recommend" | "sources";
type Obs = { date: string; value: number };
type MacroPoint = { def: { id: string; label: string; unit: string; group: string; note: string; decimals?: number }; latest: number | null; date: string | null; history: Obs[]; error?: string };
type MacroData = {
  snapshot: MacroPoint[] | null;
  yieldCurve: { asOf: string; yearAgoDate: string | null; points: { label: string; years: number; now: number | null; yearAgo: number | null }[] } | null;
  policyRates: { effr: { date: string; rate: number; targetFrom: number | null; targetTo: number | null } | null; sofr: { date: string; rate: number } | null } | null;
  fomc: { year: number; start: string; end: string; label: string; hasProjections: boolean; statementUrl: string | null; minutesUrl: string | null }[] | null;
  blsReleases: { date: string; time: string | null; title: string; source: string }[] | null;
  regime: { label: string; title: string; summary: string; implication: string; detail: string; warnings: string[]; missing: string[]; asOf: string | null } | null;
  provenance: Record<string, { fetchedAt: string; stale: boolean } | null>;
};
type NewsItem = { title: string; link: string; date: string | null; summary: string | null; source: string; tag?: string };
type NewsData = {
  items: NewsItem[];
  feeds: { id: string; source: string; ok: boolean; stale: boolean; fetchedAt: string | null; count: number }[];
  earningsReleases: { company: string; tickers: string[]; filed: string; form: string; url: string }[];
  announcements: NewsItem[];
  upcomingEarnings: { enabled: boolean; data: { data: { symbol: string; date: string; hour: string | null }[]; fetchedAt: string; stale: boolean } | null };
};
type Goal = "income" | "growth" | "lowcost" | "defensive" | "balanced";
type RecommendationData = {
  goal: Goal;
  goalDefinition: { label: string; description: string; weights: { metric: string; label: string; w: number; higherIsBetter: boolean }[] };
  assetClass: string;
  ranked: { row: ScreenRow; score: number; coverage: number; parts: { label: string; rank: number; value: number; weight: number }[] }[];
  eligible: number;
  returned: number;
  note: string;
};
type SourceInfo = { id: string; name: string; category: string; provider: string; auth: string; envVar?: string; freeLimits: string; provides: string[]; verification: "live" | "docs" | "partial" | "failed"; testedNote: string; usedInApp: boolean; caveats: string[] };
type SourceCatalog = { verifiedOn: string; sources: SourceInfo[] };
type SourceHealth = { checkedAt: string; results: { id: string; status: "ok" | "reachable" | "down"; httpStatus: number | null; ms: number | null; note: string }[]; configured: Record<string, boolean> };
type Coverage = { generatedAt: string; universeSize: number; inDatabase: number; hydrated: number; quotesReceived: number; fields: { key: string; label: string; group: string; have: number; total: number; pct: number | null; note?: string }[]; readiness: { feature: string; component: string; pct: number | null; status: string; basis: string }[]; byAssetClass: { assetClass: string; n: number; holdings: number; expense: number; aum: number; alloc: number }[] };

const tabs: { id: HubTab; label: string; icon: typeof Activity }[] = [
  { id: "macro", label: "Macro signals", icon: Gauge },
  { id: "news", label: "News & events", icon: Newspaper },
  { id: "recommend", label: "ETF research", icon: TrendingUp },
  { id: "sources", label: "Sources & coverage", icon: Layers3 },
];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${response.status})`);
  return data as T;
}

function valueFmt(value: number | null, unit: string, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (unit === "%") return `${value.toFixed(decimals)}%`;
  if (unit === "pp") return `${value.toFixed(decimals)} pp`;
  if (unit === "$T") return `$${value.toFixed(decimals)}T`;
  if (unit === "$/bbl") return `$${value.toFixed(decimals)}`;
  if (unit === "k jobs") return `${Math.round(value).toLocaleString()}k`;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}
const dateFmt = (date: string | null | undefined) => date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString() : "N/A";
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(1)}%`;
const usd = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function PanelHeader({ icon: Icon, title, subtitle, onRefresh, refreshing }: { icon: typeof Activity; title: string; subtitle: string; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-300"><Icon className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold text-white">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">{subtitle}</p></div></div>
      {onRefresh && <button onClick={onRefresh} disabled={refreshing} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-emerald-500/50 hover:text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>}
    </div>
  );
}

function LoadNotice({ error, detail }: { error: string | null; detail: string }) {
  if (error) return <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><b>Data unavailable.</b> {error}<div className="mt-1 text-amber-100/70">{detail}</div></div></div>;
  return null;
}

function MacroSignalsPanel() {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await requestJson<MacroData>("/api/macro")); }
    catch (e) { setError(e instanceof Error ? e.message : "Macro request failed"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load, stamp]);
  const regimeColor = data?.regime?.label === "stress" ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : data?.regime?.label === "tightening" ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : data?.regime?.label === "easing" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-slate-700 bg-slate-900 text-slate-100";
  const macroGroups = [...new Set(data?.snapshot?.map((item) => item.def.group) ?? [])];
  const upcomingFomc = data?.fomc?.filter((meeting) => meeting.end >= new Date().toISOString().slice(0, 10)).slice(0, 3) ?? [];
  const nextBls = data?.blsReleases?.slice(0, 5) ?? [];
  return (
    <div className="space-y-5">
      <PanelHeader icon={Gauge} title="Macro → Action" subtitle="Rates, inflation, labor, the Treasury curve, policy calendars, and market-stress signals from FRED, the NY Fed, the Federal Reserve, and BLS. Derived regime signals are deterministic summaries—not forecasts." onRefresh={() => setStamp((value) => value + 1)} refreshing={loading} />
      <LoadNotice error={error} detail="Configure DATABASE_URL for persistent caching. FRED / NY Fed / government endpoints can also be unavailable or rate-limited; missing observations are not substituted." />
      {loading && !data ? <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading macro observations…</div> : <>
        {data?.regime ? <section className={`rounded-2xl border p-5 shadow-lg ${regimeColor}`}><div className="flex flex-col justify-between gap-4 lg:flex-row"><div className="max-w-3xl"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] opacity-80"><Activity className="h-3.5 w-3.5" /> Current macro regime · as of {data.regime.asOf ?? "N/A"}</div><h3 className="mt-2 text-xl font-extrabold">{data.regime.title}</h3><p className="mt-1 text-sm leading-relaxed opacity-85">{data.regime.summary}</p></div><div className="rounded-xl border border-current/10 bg-slate-950/30 p-4 lg:max-w-md"><div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Portfolio & wheel context</div><p className="mt-1 text-xs leading-relaxed">{data.regime.implication}</p></div></div>{data.regime.warnings.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{data.regime.warnings.map((warning) => <span key={warning} className="rounded-full border border-current/20 bg-slate-950/20 px-2.5 py-1 text-[10px]">{warning}</span>)}</div>}{data.regime.missing.length > 0 && <p className="mt-3 text-[10px] opacity-60">Signal gaps: {data.regime.missing.join(", ")}</p>}</section> : <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">Regime label unavailable until source macro observations are present.</div>}
        <section className="grid gap-4 xl:grid-cols-2">{macroGroups.map((group) => <div key={group} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{group}</h3><span className="text-[9px] text-slate-600">FRED · provider as-of per series</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(data?.snapshot ?? []).filter((item) => item.def.group === group).map((item) => <div key={item.def.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3" title={item.def.note}><div className="flex items-start justify-between gap-2"><span className="text-[10px] font-semibold leading-tight text-slate-500">{item.def.label}</span><span className="shrink-0 font-mono text-[9px] text-slate-700">{item.date ?? "—"}</span></div><div className="mt-2 font-mono text-base font-bold text-slate-100">{valueFmt(item.latest, item.def.unit, item.def.decimals ?? 2)}</div>{item.error && <div className="mt-1 line-clamp-1 text-[9px] text-amber-300/70" title={item.error}>Series unavailable</div>}</div>)}</div>{data?.provenance?.snapshot?.stale && <span className="mt-3 inline-block rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">Cached macro snapshot · stale</span>}</div>)}</section>
        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-white">US Treasury yield curve</h3><p className="mt-1 text-[10px] text-slate-500">Current vs. prior year · latest common observation {data?.yieldCurve?.asOf ?? "N/A"}</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-400">FRED</span></div>
            {data?.yieldCurve?.points?.length ? <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-11">{data.yieldCurve.points.map((point) => <div key={point.label} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2 text-center"><div className="font-mono text-[10px] text-slate-500">{point.label}</div><div className="mt-1 font-mono text-xs font-bold text-emerald-300">{point.now == null ? "N/A" : `${point.now.toFixed(2)}%`}</div><div className="mt-1 text-[9px] text-slate-600">1Y {point.yearAgo == null ? "N/A" : `${point.yearAgo.toFixed(2)}%`}</div></div>)}</div> : <p className="mt-4 rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">Yield-curve data not available.</p>}
            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">Fed funds target</div><div className="mt-1 font-mono text-sm text-slate-200">{data?.policyRates?.effr?.targetFrom == null ? "N/A" : `${data.policyRates.effr.targetFrom.toFixed(2)}–${data.policyRates.effr.targetTo?.toFixed(2) ?? "N/A"}%`}</div><div className="mt-1 text-[10px] text-slate-600">EFFR {data?.policyRates?.effr?.rate == null ? "N/A" : `${data.policyRates.effr.rate.toFixed(2)}%`} · {data?.policyRates?.effr?.date ?? ""}</div></div><div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">SOFR</div><div className="mt-1 font-mono text-sm text-slate-200">{data?.policyRates?.sofr?.rate == null ? "N/A" : `${data.policyRates.sofr.rate.toFixed(2)}%`}</div><div className="mt-1 text-[10px] text-slate-600">NY Fed · {data?.policyRates?.sofr?.date ?? ""}</div></div></div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-emerald-300" /><h3 className="text-sm font-bold text-white">Next scheduled events</h3></div><div className="mt-4 space-y-4"><div><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">FOMC meetings</div>{upcomingFomc.length ? upcomingFomc.map((meeting) => <div key={meeting.start} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-2.5"><div><div className="text-xs text-slate-200">{meeting.label}</div><div className="mt-1 text-[10px] text-slate-500">{meeting.hasProjections ? "Economic projections" : "Policy meeting"}</div></div>{meeting.statementUrl && <a href={meeting.statementUrl} target="_blank" rel="noreferrer" className="text-emerald-300 hover:text-emerald-200" aria-label="FOMC statement"><ExternalLink className="h-3.5 w-3.5" /></a>}</div>) : <p className="text-xs text-slate-500">No FOMC dates available.</p>}</div><div><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">BLS releases · next 45 days</div>{nextBls.length ? nextBls.map((event) => <div key={`${event.date}-${event.title}`} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-2.5"><div className="text-xs text-slate-300">{event.title}</div><div className="shrink-0 text-right font-mono text-[10px] text-slate-500">{event.date}<div>{event.time ?? ""}</div></div></div>) : <p className="text-xs text-slate-500">No BLS schedule available.</p>}</div></div></div>
        </section>
        <p className="text-[10px] text-slate-600">Macro data as-of dates are shown per series. The regime card is a deterministic heuristic and should not be treated as a forecast or a trade signal.</p>
      </>}</div>
  );
}

function NewsPanel() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"feeds" | "earnings" | "8k">("feeds");
  const [stamp, setStamp] = useState(0);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await requestJson<NewsData>("/api/news?limit=50")); } catch (e) { setError(e instanceof Error ? e.message : "News request failed"); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load, stamp]);
  const items = view === "feeds" ? data?.items ?? [] : view === "8k" ? data?.announcements ?? [] : [];
  return (
    <div className="space-y-5">
      <PanelHeader icon={Newspaper} title="News & event radar" subtitle="Policy releases, SEC filings, company announcements, and—when configured—an upcoming earnings calendar. Each headline links to its source; stale feeds are labeled." onRefresh={() => setStamp((value) => value + 1)} refreshing={loading} />
      <LoadNotice error={error} detail="The feed cache is stored in PostgreSQL. Feed providers may be unavailable or rate-limited; empty feeds are not replaced with generated headlines." />
      <div className="flex flex-wrap gap-2">{[{ id: "feeds", label: "Policy & market feeds" }, { id: "earnings", label: "SEC earnings filings" }, { id: "8k", label: "Recent 8-Ks" }].map((tab) => <button key={tab.id} onClick={() => setView(tab.id as typeof view)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${view === tab.id ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20" : "border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"}`}>{tab.label}</button>)}</div>
      {loading && !data ? <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading source feeds…</div> : <>
        {view === "feeds" && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-2">{items.length ? items.map((item, index) => <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-800 bg-slate-900 p-4 transition hover:border-emerald-500/40"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">{item.source}</span>{item.tag && <span className="text-[10px] text-slate-500">{item.tag}</span>}</div><h3 className="mt-2 text-sm font-semibold text-slate-100">{item.title}</h3>{item.summary && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{item.summary}</p>}</div><ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-500" /></div><div className="mt-3 text-[10px] font-mono text-slate-600">{item.date ? new Date(item.date).toLocaleString() : "Date not provided by feed"}</div></a>) : <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-500">No feed items available right now.</div>}</div><aside className="h-fit rounded-xl border border-slate-800 bg-slate-900 p-4"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Feed health</h3><div className="mt-3 space-y-2">{data?.feeds.map((feed) => <div key={feed.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-2.5"><div><div className="text-xs text-slate-300">{feed.source}</div><div className="mt-0.5 text-[10px] text-slate-600">{feed.count} items · {feed.fetchedAt ? new Date(feed.fetchedAt).toLocaleTimeString() : "not checked"}</div></div><span className={`h-2 w-2 rounded-full ${feed.ok ? feed.stale ? "bg-amber-400" : "bg-emerald-400" : "bg-slate-600"}`} title={feed.ok ? feed.stale ? "stale cache" : "healthy" : "unavailable"} /></div>)}</div></aside></div>}
        {view === "earnings" && <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 px-4 py-3 text-[10px] text-slate-500">SEC EDGAR 8-K filings carrying earnings-release items · trailing 14 days · source: sec.gov</div>{data?.earningsReleases.length ? data.earningsReleases.map((filing, index) => <a key={`${filing.url}-${index}`} href={filing.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 border-b border-slate-800/80 px-4 py-3 last:border-0 hover:bg-slate-800/60"><div><div className="text-xs font-semibold text-white">{filing.company}</div><div className="mt-1 text-[10px] text-slate-500">{filing.tickers.join(", ") || "No ticker mapped"} · {filing.form}</div></div><div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">{filing.filed}<ExternalLink className="h-3.5 w-3.5" /></div></a>) : <p className="p-8 text-center text-xs text-slate-500">No earnings-release filings found in the current window.</p>}</div>}
        {view === "8k" && <div className="space-y-2">{items.length ? items.map((item, index) => <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500/40"><div><div className="text-xs font-semibold text-slate-200">{item.title}</div><div className="mt-1 text-[10px] text-slate-500">{item.source} · {item.date ? new Date(item.date).toLocaleString() : "date unavailable"}</div></div><ExternalLink className="h-4 w-4 shrink-0 text-slate-500" /></a>) : <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900 p-8 text-center text-xs text-slate-500">No recent 8-K announcements available.</div>}</div>}
        {view === "feeds" && data?.upcomingEarnings?.enabled && <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="mb-3 text-xs font-bold text-slate-300">Upcoming earnings · Finnhub</div>{data.upcomingEarnings.data?.data?.length ? <div className="flex flex-wrap gap-2">{data.upcomingEarnings.data.data.slice(0, 20).map((item) => <span key={`${item.symbol}-${item.date}`} className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-[10px] text-slate-300">{item.symbol} · {item.date} {item.hour ?? ""}</span>)}</div> : <div className="text-xs text-slate-500">The calendar key is configured, but no events were returned.</div>}</div>}
      </>}
    </div>
  );
}

function RecommendPanel() {
  const [goal, setGoal] = useState<Goal>("balanced");
  const [assetClass, setAssetClass] = useState("all");
  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ goal });
    if (assetClass !== "all") params.set("assetClass", assetClass);
    try { setData(await requestJson<RecommendationData>(`/api/recommend?${params.toString()}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Recommendation request failed"); }
    finally { setLoading(false); }
  }, [goal, assetClass]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  return (
    <div className="space-y-5">
      <PanelHeader icon={TrendingUp} title="Transparent ETF research rankings" subtitle="Choose an objective to rank funds by published metric weights. Percentile ranks are computed within asset class by default; the model omits records without sufficient real-data coverage." />
      <LoadNotice error={error} detail="Hydrate the ETF universe and configure PostgreSQL to build the ranked dataset. No investment recommendation is generated when the inputs are missing." />
      <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] sm:items-end"><label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Research goal<select value={goal} onChange={(event) => setGoal(event.target.value as Goal)} className="mt-1.5 block w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs normal-case tracking-normal text-slate-200 outline-none focus:border-emerald-500/60"><option value="balanced">Balanced total return</option><option value="income">Income</option><option value="growth">Growth</option><option value="lowcost">Low-cost core</option><option value="defensive">Defensive / low volatility</option></select></label><label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Peer group<select value={assetClass} onChange={(event) => setAssetClass(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs normal-case tracking-normal text-slate-200 outline-none focus:border-emerald-500/60"><option value="all">All asset classes · rank within class</option><option value="Equity">Equity</option><option value="Fixed income">Fixed income</option><option value="Commodities & crypto">Commodities & crypto</option><option value="Cash-like">Cash-like</option></select></label><div className="text-right text-[10px] text-slate-500">{loading ? "Scoring…" : data ? `${data.returned} ranked · ${data.eligible} screened` : "No score"}</div></div>
      {data && <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-start gap-2 text-xs font-semibold text-slate-200"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />{data.goalDefinition.label}: {data.goalDefinition.description}</div><div className="mt-3 flex flex-wrap gap-2">{data.goalDefinition.weights.map((weight) => <span key={weight.metric} className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[10px] text-slate-400">{weight.label} <b className="font-mono text-emerald-300">{(weight.w * 100).toFixed(0)}%</b></span>)}</div></div>}
      {loading && !data ? <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading transparent rankings…</div> : data?.ranked.length ? <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="grid grid-cols-[36px_minmax(110px,1fr)_82px_90px] gap-2 border-b border-slate-800 bg-slate-950 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:grid-cols-[48px_minmax(150px,1fr)_100px_110px_130px]"><span>#</span><span>ETF</span><span className="text-right">Score</span><span className="text-right">Data coverage</span><span className="hidden text-right sm:block">3Y total return</span></div>{data.ranked.slice(0, 20).map((entry, index) => <div key={entry.row.ticker} className="grid grid-cols-[36px_minmax(110px,1fr)_82px_90px] items-center gap-2 border-b border-slate-800/80 px-4 py-3 last:border-0 sm:grid-cols-[48px_minmax(150px,1fr)_100px_110px_130px]"><span className="font-mono text-xs text-slate-500">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><div className="font-mono text-xs font-bold text-white">{entry.row.ticker} <span className="ml-1 font-sans font-normal text-slate-400">{entry.row.name ?? ""}</span></div><div className="mt-1 text-[10px] text-slate-600">{entry.row.category ?? entry.row.assetClass}</div></div><div className="text-right font-mono text-sm font-bold text-emerald-300">{entry.score.toFixed(0)}</div><div className="text-right font-mono text-xs text-slate-300">{pct(entry.coverage)}</div><div className="hidden text-right font-mono text-xs text-slate-300 sm:block">{pct(entry.row.r3y)}</div></div>)}</div> : data && <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900 p-8 text-center text-xs text-slate-500">Not enough stored coverage to rank funds yet. Continue ETF hydration and try again.</div>}
      {data?.note && <p className="text-[10px] leading-relaxed text-slate-600">{data.note}</p>}
    </div>
  );
}

function SourcesCoveragePanel() {
  const [catalog, setCatalog] = useState<SourceCatalog | null>(null);
  const [health, setHealth] = useState<SourceHealth | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const results = await Promise.allSettled([requestJson<SourceCatalog>("/api/sources"), requestJson<Coverage>("/api/coverage")]);
    if (results[0].status === "fulfilled") setCatalog(results[0].value);
    if (results[1].status === "fulfilled") setCoverage(results[1].value);
    const failures = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    if (failures.length === results.length) setError(failures.map((failure) => failure.reason instanceof Error ? failure.reason.message : "Request failed").join("; "));
    else if (failures.length) setError("Some coverage metrics could not load; the source catalog remains available.");
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const checkHealth = async () => { setChecking(true); try { setHealth(await requestJson<SourceHealth>("/api/sources/health")); } catch (e) { setError(e instanceof Error ? e.message : "Health checks failed"); } finally { setChecking(false); } };
  const categories = [...new Set(catalog?.sources.map((source) => source.category) ?? [])];
  const visibleSources = catalog?.sources.filter((source) => filter === "all" || source.category === filter) ?? [];
  const healthById = new Map((health?.results ?? []).map((item) => [item.id, item]));
  const statusColor = (status?: string) => status === "ok" ? "bg-emerald-400" : status === "reachable" ? "bg-amber-400" : status === "down" ? "bg-rose-400" : "bg-slate-700";
  return (
    <div className="space-y-5">
      <PanelHeader icon={Layers3} title="Source catalog & data coverage" subtitle="Provider catalog, live health checks, field-population audit, and the downloadable data-integrity specification. API credentials remain server-side and only the configured/not-configured state is shown." onRefresh={() => void load()} refreshing={loading} />
      <LoadNotice error={error} detail="Coverage requires a migrated database. External health checks are manual so the app does not repeatedly ping third-party services." />
      <div className="grid gap-3 sm:grid-cols-4">{[{ label: "Sources catalogued", value: `${catalog?.sources.length ?? "—"}` }, { label: "Funds in database", value: `${coverage?.hydrated ?? "—"}` }, { label: "Universe", value: `${coverage?.universeSize ?? "—"}` }, { label: "Quote coverage", value: `${coverage?.quotesReceived ?? "—"}` }].map((metric) => <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900 p-3.5"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{metric.label}</div><div className="mt-1 font-mono text-lg font-bold text-slate-100">{metric.value}</div></div>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="text-xs text-slate-400">{catalog ? `Verification record date ${catalog.verifiedOn}` : "Loading source catalog…"}{health?.checkedAt ? ` · checks ${new Date(health.checkedAt).toLocaleTimeString()}` : ""}</div><div className="flex gap-2"><a href="/api/spec" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:text-white"><Download className="h-3.5 w-3.5" />Download source spec</a><button onClick={() => void checkHealth()} disabled={checking} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><Activity className={`h-3.5 w-3.5 ${checking ? "animate-pulse" : ""}`} />{checking ? "Checking…" : "Check providers"}</button></div></div>
      {coverage?.fields?.length ? <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-white">Data field coverage</h3><p className="mt-1 text-[10px] text-slate-500">Coverage counts only stored provider/derived values; fields are not imputed.</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-mono text-slate-400">{coverage.hydrated} hydrated</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{coverage.fields.map((field) => <div key={field.key} className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-300">{field.label}</span><span className="font-mono text-[10px] text-slate-500">{field.have}/{field.total}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, (field.pct ?? 0) * 100))}%` }} /></div><div className="mt-1 text-right font-mono text-[9px] text-slate-600">{field.pct == null ? "N/A" : `${(field.pct * 100).toFixed(0)}%`}</div></div>)}</div></section> : null}
      {coverage?.readiness?.length ? <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="mb-3"><h3 className="text-sm font-bold text-white">Feature readiness</h3><p className="mt-1 text-[10px] text-slate-500">Readiness is based on observed field coverage, not a promise that a feature has sufficient sample quality.</p></div><div className="grid gap-2 sm:grid-cols-2">{coverage.readiness.map((item, index) => <div key={`${item.feature}-${item.component}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold text-slate-300">{item.feature}</div><div className="mt-1 text-xs text-slate-400">{item.component}</div></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase ${item.status === "ready" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : item.status === "partial" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : item.status === "not ready" ? "border-rose-500/20 bg-rose-500/10 text-rose-300" : "border-slate-700 text-slate-400"}`}>{item.status}</span></div><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(0, Math.min(100, (item.pct ?? 0) * 100))}%` }} /></div><span className="w-10 text-right font-mono text-[10px] text-slate-500">{item.pct == null ? "N/A" : `${(item.pct * 100).toFixed(0)}%`}</span></div><p className="mt-2 line-clamp-2 text-[9px] leading-relaxed text-slate-600" title={item.basis}>{item.basis}</p></div>)}</div></section> : null}
      {coverage?.byAssetClass?.length ? <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h3 className="text-sm font-bold text-white">Coverage by asset class</h3><div className="mt-3 flex flex-wrap gap-2">{coverage.byAssetClass.map((item) => <div key={item.assetClass} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-400"><b className="text-slate-200">{item.assetClass}</b><span className="ml-2">{item.n} funds · {item.holdings} with weighted holdings · {item.expense} fees · {item.aum} AUM</span></div>)}</div></section> : null}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-sm font-bold text-white">External provider catalog</h3><p className="mt-1 text-[10px] text-slate-500">Usage, access requirements, limitations and verification are listed per source.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 outline-none"><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div><div className="mt-4 grid gap-3 xl:grid-cols-2">{visibleSources.map((source) => { const check = healthById.get(source.id); const configured = health?.configured?.[source.id]; return <article key={source.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-xs font-bold text-slate-100">{source.name}</h4><span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase ${source.verification === "live" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : source.verification === "partial" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : source.verification === "failed" ? "border-rose-500/20 bg-rose-500/10 text-rose-300" : "border-slate-700 text-slate-400"}`}>{source.verification}</span>{source.usedInApp && <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] text-cyan-300">Used in app</span>}</div><p className="mt-1 text-[10px] text-slate-500">{source.category} · {source.provider}</p></div><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusColor(check?.status)}`} title={check ? `${check.status} · ${check.note}` : "Health not checked"} /></div><p className="mt-3 text-[11px] leading-relaxed text-slate-400">{source.freeLimits}</p>{source.envVar && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]"><span className="text-slate-600">Key:</span><code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">{source.envVar}</code>{configured != null && <span className={`inline-flex items-center gap-1 ${configured ? "text-emerald-400" : "text-slate-500"}`}>{configured ? <Check className="h-3 w-3" /> : <CircleHelp className="h-3 w-3" />}{configured ? "configured" : "not configured"}</span>}</div>}{check && <div className="mt-2 text-[10px] text-slate-600">{check.note}{check.ms != null ? ` · ${check.ms} ms` : ""}</div>}<div className="mt-3 flex flex-wrap gap-2">{source.provides.slice(0, 4).map((item) => <span key={item} className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[9px] text-slate-400">{item}</span>)}</div>{source.caveats?.length > 0 && <p className="mt-3 text-[10px] leading-relaxed text-amber-200/70">Caveat: {source.caveats[0]}</p>}</article>; })}</div></section>
      <div className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[10px] leading-relaxed text-slate-500"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />Availability and free-tier terms change. This catalog records the source repository&apos;s verification notes; rerun health checks and review provider terms before relying on data.</div>
    </div>
  );
}

export function LiveResearchHub() {
  const [active, setActive] = useState<HubTab>("macro");
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-400" /><h1 className="text-xl font-extrabold text-white">Live Research Hub</h1></div><p className="mt-1 text-xs text-slate-400">Data sources, macro context, event feeds, and transparent ETF scoring—inside the original WheelCore visual system.</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-[10px] text-slate-400">Source-stamped · no synthetic fills</span></div></div>
      <nav className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-3">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setActive(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${active === tab.id ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20" : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}><Icon className="h-3.5 w-3.5" />{tab.label}</button>; })}</nav>
      {active === "macro" && <MacroSignalsPanel />}
      {active === "news" && <NewsPanel />}
      {active === "recommend" && <RecommendPanel />}
      {active === "sources" && <SourcesCoveragePanel />}
    </div>
  );
}
