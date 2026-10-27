import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, CircleHelp, Database, Gauge, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { LiveWheelDetailView } from "./LiveWheelDetailView";
import type { OptionContract } from "../../lib/wheel";

type WheelRow = {
  g: { grade: string | null; row: { ticker: string; name: string | null; sector: string | null; price: number | null; fundamentals: { beta?: number | null } | null; events: { nextEarnings?: string | null; earningsEstimated?: boolean } | null } };
  ctx: { price: number; nextEarnings: string | null; dividendYield: number | null; beta: number | null };
  best: { contract: { strike: number; expiration: string; delta: number | null; iv: number | null; bid: number | null; ask: number | null }; dte: number; credit: number; cash: number; annRoc: number; roc: number; score: number; breakeven: number; breakevenCushion: number; probOtm: number; account: { flag: string } };
  count: number;
  source: string | null;
  fallbackReason: string | null;
  scannedAt: string;
};
type Results = { rows: WheelRow[]; heldBackByEarnings: { ticker: string; days: number | null }[]; earningsWatch: { g: { row: { ticker: string; name: string | null } }; days: number; estimated: boolean }[]; rejected: Record<string, number>; info: { eligible: number; scanned: number; failed: { ticker: string; error: string }[]; waiting: number; oldest: string | null; sources: Record<string, number>; fallbacks: number; universe: number; hydrated: number; staleStocks: number; missingFields: number; missingDropped: number }; ivRanks: Record<string, number | null>; generatedAt: string };
type WheelPosition = { id: string; ticker: string; side: "put_sold" | "assigned" | "call_sold" | "closed"; strike: number; expiration: string; premium: number; quantity: number; openedAt: string; closedAt: string | null; costBasis: number | null; notes: string | null; createdAt: string };
type Chain = { symbol: string; price: number; nextEarnings: string | null; source: string; fetchedAt: string | null; stale: boolean; contracts: { type: "put" | "call"; strike: number; expiration: string; bid: number | null; ask: number | null; iv: number | null; delta: number | null; oi: number | null }[] };
type WheelFilterState = { grade: string; gradeMatch: "minimum" | "exact"; sortBy: "score" | "annRoc"; account: string; dteMin: string; dteMax: string; deltaMin: string; deltaMax: string; minOi: string; maxSpread: string; minReturn: string; minScore: string; earnings: boolean; trend: boolean; dividendOnly: boolean };
const initialFilters: WheelFilterState = { grade: "A", gradeMatch: "minimum", sortBy: "score", account: "all", dteMin: "21", dteMax: "50", deltaMin: "0.15", deltaMax: "0.3", minOi: "100", maxSpread: "10", minReturn: "8", minScore: "15", earnings: false, trend: false, dividendOnly: false };

const cash = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(1)}%`;
const inputClass = "w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

export function LiveWheelView() {
  const [results, setResults] = useState<Results | null>(null);
  const [positions, setPositions] = useState<WheelPosition[]>([]);
  const [filterValues, setFilterValues] = useState<WheelFilterState>(initialFilters);
  const [filterQuery, setFilterQuery] = useState("");
  const [chain, setChain] = useState<Chain | null>(null);
  const [chainTicker, setChainTicker] = useState<string | null>(null);
  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"refresh" | "scan" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [entry, setEntry] = useState({ ticker: "", side: "put_sold", strike: "", expiration: "", premium: "", quantity: "1", costBasis: "", openedAt: new Date().toISOString().slice(0, 10), notes: "" });
  const journalFormRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const resultsUrl = `/api/wheel/results${filterQuery ? `?${filterQuery}` : ""}`;
    const [scanResult, positionResult] = await Promise.allSettled([requestJson<Results>(resultsUrl), requestJson<{ positions: WheelPosition[] }>("/api/wheel/positions")]);
    if (scanResult.status === "fulfilled") setResults(scanResult.value);
    if (positionResult.status === "fulfilled") setPositions(positionResult.value.positions ?? []);
    const failures = [scanResult, positionResult].filter((item) => item.status === "rejected") as PromiseRejectedResult[];
    if (failures.length) setError(failures.map((item) => item.reason instanceof Error ? item.reason.message : "Request failed").join("; "));
    setLoading(false);
  }, [filterQuery]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const query = new URLSearchParams({
      preset: filterValues.grade,
      gradeMatch: filterValues.gradeMatch,
      sortBy: filterValues.sortBy,
      acct: filterValues.account,
      dteMin: filterValues.dteMin,
      dteMax: filterValues.dteMax,
      dMin: filterValues.deltaMin,
      dMax: filterValues.deltaMax,
      oi: filterValues.minOi,
      spread: filterValues.maxSpread,
      ret: filterValues.minReturn,
      minScore: filterValues.minScore,
    });
    if (filterValues.earnings) query.set("earn", "1");
    if (filterValues.trend) query.set("trend", "1");
    if (filterValues.dividendOnly) query.set("divOnly", "1");
    setFilterQuery(query.toString());
  };

  const runBatch = async (kind: "refresh" | "scan") => {
    setAction(kind); setError(null); setMessage(null);
    try {
      const result = await requestJson<{ processed?: { ticker: string; ok: boolean; error?: string }[]; remaining?: number; total?: number }>(kind === "refresh" ? "/api/wheel/refresh" : "/api/wheel/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 8 }) });
      const complete = result.processed?.filter((item) => item.ok).length ?? 0;
      const failed = result.processed?.filter((item) => !item.ok).length ?? 0;
      setMessage(`${kind === "refresh" ? "Stock fundamentals" : "Option chains"}: ${complete} completed${failed ? `, ${failed} failed` : ""}; ${result.remaining ?? 0} remain queued.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Batch action failed"); }
    finally { setAction(null); }
  };

  const loadChain = async (ticker: string) => {
    setChainTicker(ticker); setChain(null); setError(null);
    try { setChain(await requestJson<Chain>(`/api/wheel/chain?symbol=${encodeURIComponent(ticker)}&type=both&dteMin=7&dteMax=70`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Option chain could not be loaded"); setChainTicker(null); }
  };

  const prefillPosition = (ticker: string, contract: OptionContract, costBasis: number | null) => {
    const premium = contract.bid != null && contract.ask != null && contract.ask >= contract.bid
      ? contract.bid + 0.25 * (contract.ask - contract.bid)
      : contract.bid ?? contract.last ?? 0;
    setEntry((current) => ({
      ...current,
      ticker: ticker.toUpperCase(),
      side: contract.type === "put" ? "put_sold" : "call_sold",
      strike: String(contract.strike),
      expiration: contract.expiration,
      premium: premium.toFixed(2),
      quantity: "1",
      costBasis: contract.type === "put" ? "" : costBasis == null ? current.costBasis : String(costBasis),
      openedAt: new Date().toISOString().slice(0, 10),
      notes: `Prefilled from ${contract.symbol}; review quote and enter actual fill before saving.`,
    }));
    setDetailTicker(null);
    setMessage(`${ticker.toUpperCase()} ${contract.type} prefilled in the journal form. Review the details and actual fill before saving.`);
    window.setTimeout(() => journalFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const savePosition = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null); setMessage(null);
    try {
      const created = await requestJson<{ position: WheelPosition }>("/api/wheel/positions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...entry, ticker: entry.ticker.toUpperCase(), strike: Number(entry.strike), premium: Number(entry.premium), quantity: Number(entry.quantity), costBasis: entry.costBasis ? Number(entry.costBasis) : null }) });
      setMessage(`${created.position.ticker} wheel position saved.`);
      setEntry({ ticker: "", side: "put_sold", strike: "", expiration: "", premium: "", quantity: "1", costBasis: "", openedAt: new Date().toISOString().slice(0, 10), notes: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Position could not be saved"); }
    finally { setSaving(false); }
  };

  const closePosition = async (position: WheelPosition) => {
    setSaving(true); setError(null);
    try {
      await requestJson("/api/wheel/positions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: position.id, side: "closed", closedAt: new Date().toISOString().slice(0, 10) }) });
      setMessage(`${position.ticker} position marked closed.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Position could not be updated"); }
    finally { setSaving(false); }
  };

  const deletePosition = async (position: WheelPosition) => {
    if (!window.confirm(`Delete ${position.ticker} wheel entry?`)) return;
    setSaving(true); setError(null);
    try { await requestJson(`/api/wheel/positions?id=${encodeURIComponent(position.id)}`, { method: "DELETE" }); setMessage("Wheel position deleted."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Position could not be deleted"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/25 p-5 shadow-xl"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300"><Activity className="h-4 w-4" /> Provider-backed options desk</div><h2 className="mt-2 text-xl font-extrabold text-white">Live Wheel Scanner & Journal</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">The scanner filters real option-chain quotes against delta, liquidity, spread, earnings and return rules. Refresh stock fundamentals and scan option chains in small batches; saved entries are separate from candidate ideas.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} disabled={loading || action !== null} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Reload</button><button onClick={() => void runBatch("refresh")} disabled={action !== null} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50"><Database className={`h-3.5 w-3.5 ${action === "refresh" ? "animate-pulse" : ""}`} />{action === "refresh" ? "Refreshing…" : "Hydrate 8 stocks"}</button><button onClick={() => void runBatch("scan")} disabled={action !== null} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${action === "scan" ? "animate-spin" : ""}`} />{action === "scan" ? "Scanning…" : "Scan 8 chains"}</button></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ label: "Universe stocks", value: results ? `${results.info.universe}` : "—" }, { label: "Stocks with chain scans", value: results ? `${results.info.scanned}` : "—" }, { label: "Waiting on data", value: results ? `${results.info.waiting}` : "—" }, { label: "Qualified put candidates", value: results ? `${results.rows.length}` : "—" }].map((item) => <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</div><div className="mt-1 font-mono text-lg font-bold text-slate-100">{item.value}</div></div>)}</div>
      </section>
      {error && <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}. These services require PostgreSQL with the included schema; provider responses can be delayed, rate-limited or unavailable.</div>}
      {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{message}</div>}
      {results && <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1">Hydrated {results.info.hydrated}/{results.info.universe}</span><span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1">Scanned {results.info.scanned}/{results.info.eligible}</span><span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1">Fallback sources {results.info.fallbacks}</span><span>Generated {new Date(results.generatedAt).toLocaleString()}</span></div>}

      <form onSubmit={applyFilters} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-xs font-bold text-white">Scanner filters</h3><p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-500">Minimum-grade matching includes higher grades; exact mode matches only the selected grade. Automatic batch option scans cover C and better. “All graded” can include D/F only when a recent scan exists—open a ticker workspace to inspect a direct chain.</p></div><button className="rounded-lg bg-cyan-600 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-500">Apply filters</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Stock grade<select value={filterValues.grade} onChange={(event) => setFilterValues({ ...filterValues, grade: event.target.value, gradeMatch: event.target.value === "all" ? "minimum" : filterValues.gradeMatch })} className={inputClass + " mt-1"}><option value="A+">A+</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="all">All saved graded scans</option></select></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Grade matching<select value={filterValues.gradeMatch} onChange={(event) => setFilterValues({ ...filterValues, gradeMatch: event.target.value as "minimum" | "exact" })} className={inputClass + " mt-1"}><option value="minimum">This grade or higher</option><option value="exact" disabled={filterValues.grade === "all"}>Exact grade only</option></select></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Rank results by<select value={filterValues.sortBy} onChange={(event) => setFilterValues({ ...filterValues, sortBy: event.target.value as "score" | "annRoc" })} className={inputClass + " mt-1"}><option value="score">Best overall score</option><option value="annRoc">Highest annualized ROC</option></select></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Account fit<select value={filterValues.account} onChange={(event) => setFilterValues({ ...filterValues, account: event.target.value })} className={inputClass + " mt-1"}><option value="all">All</option><option value="R">Retirement · R</option><option value="T">Taxable · T</option></select></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Minimum score<input type="number" min="0" max="100" value={filterValues.minScore} onChange={(event) => setFilterValues({ ...filterValues, minScore: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">DTE range<input type="text" inputMode="numeric" aria-label="Minimum and maximum days to expiration" value={`${filterValues.dteMin}-${filterValues.dteMax}`} onChange={(event) => { const [dteMin, dteMax] = event.target.value.split("-"); setFilterValues({ ...filterValues, dteMin: dteMin ?? "", dteMax: dteMax ?? "" }); }} className={inputClass + " mt-1"} /></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Delta range<input type="text" aria-label="Minimum and maximum absolute delta" value={`${filterValues.deltaMin}-${filterValues.deltaMax}`} onChange={(event) => { const [deltaMin, deltaMax] = event.target.value.split("-"); setFilterValues({ ...filterValues, deltaMin: deltaMin ?? "", deltaMax: deltaMax ?? "" }); }} className={inputClass + " mt-1"} /></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Minimum open interest<input type="number" min="0" max="100000" value={filterValues.minOi} onChange={(event) => setFilterValues({ ...filterValues, minOi: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Max spread · %<input type="number" min="1" max="100" step="1" value={filterValues.maxSpread} onChange={(event) => setFilterValues({ ...filterValues, maxSpread: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Minimum annual return · %<input type="number" min="0" max="500" step="1" value={filterValues.minReturn} onChange={(event) => setFilterValues({ ...filterValues, minReturn: event.target.value })} className={inputClass + " mt-1"} /></label><label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.earnings} onChange={(event) => setFilterValues({ ...filterValues, earnings: event.target.checked })} className="accent-emerald-500" />Allow expiration on/after earnings</label><label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.trend} onChange={(event) => setFilterValues({ ...filterValues, trend: event.target.checked })} className="accent-emerald-500" />Require above 200-day SMA</label><label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.dividendOnly} onChange={(event) => setFilterValues({ ...filterValues, dividendOnly: event.target.checked })} className="accent-emerald-500" />Dividend stocks only</label></div></form>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><h3 className="text-sm font-bold text-white">Cash-secured put candidates</h3><p className="mt-1 text-[10px] text-slate-500">Best qualifying contract per ticker · sorted by selected ranking; score is not probability of profit.</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-mono text-slate-400">{results?.rows.length ?? 0} results</span></div><div className="overflow-x-auto"><table className="min-w-[1000px] w-full text-left text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Stock", "Quote", "Grade", "Put strike", "DTE / delta", "Credit", "Ann. ROC", "Prob. OTM", "IV rank", "Cash secured", "Breakeven", "Account", "Data source"].map((header) => <th key={header} className="px-3 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{loading && !results ? <tr><td colSpan={13} className="p-8 text-center text-slate-400">Loading provider-backed scan results…</td></tr> : results?.rows.map((row) => <tr key={row.g.row.ticker} className="hover:bg-slate-800/40"><td className="px-3 py-3"><button onClick={() => setDetailTicker(row.g.row.ticker)} className="font-mono font-bold text-white hover:text-emerald-300" aria-label={`Open ${row.g.row.ticker} detail workspace`}>{row.g.row.ticker}</button><div className="max-w-36 truncate text-[10px] text-slate-500">{row.g.row.name ?? row.g.row.sector ?? ""}</div></td><td className="px-3 py-3 font-mono text-slate-300">{cash(row.ctx.price)}<div className="text-[9px] text-slate-600">{row.ctx.nextEarnings ? `Earnings ${row.ctx.nextEarnings}` : "Earnings unknown"}</div></td><td className="px-3 py-3"><span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-bold text-emerald-300">{row.g.grade ?? "N/A"}</span></td><td className="px-3 py-3 font-mono text-slate-200">${row.best.contract.strike.toFixed(2)}<div className="text-[9px] text-slate-500">{row.best.contract.expiration}</div></td><td className="px-3 py-3 font-mono text-slate-300">{row.best.dte}d<div className="text-[9px] text-slate-500">Δ {row.best.contract.delta == null ? "N/A" : row.best.contract.delta.toFixed(2)}</div></td><td className="px-3 py-3 font-mono text-emerald-300">{cash(row.best.credit)}</td><td className="px-3 py-3 font-mono text-slate-200">{pct(row.best.annRoc)}</td><td className="px-3 py-3 font-mono text-slate-300">{pct(row.best.probOtm)}</td><td className="px-3 py-3 font-mono text-slate-300">{results?.ivRanks?.[row.g.row.ticker] == null ? "N/A" : `${results.ivRanks[row.g.row.ticker]}%`}</td><td className="px-3 py-3 font-mono text-slate-300">{cash(row.best.cash)}</td><td className="px-3 py-3 font-mono text-slate-300">{cash(row.best.breakeven)}<div className="text-[9px] text-slate-600">{pct(row.best.breakevenCushion)} cushion</div></td><td className="px-3 py-3"><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[9px] text-cyan-200">{row.best.account.flag}</span></td><td className="px-3 py-3"><div className="flex flex-wrap gap-1"><button onClick={() => setDetailTicker(row.g.row.ticker)} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[10px] text-emerald-200 hover:bg-emerald-500/10">Detail workspace</button><button onClick={() => void loadChain(row.g.row.ticker)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300 hover:text-white">{chainTicker === row.g.row.ticker ? "Loading…" : "Chain snapshot"}</button></div><div className="mt-1 text-[9px] text-slate-600">{row.source ?? "Provider"} · {new Date(row.scannedAt).toLocaleString()}</div></td></tr>)}{!loading && results?.rows.length === 0 && <tr><td colSpan={13} className="p-8 text-center text-slate-500">No contracts pass the current default filters yet. Hydrate more stock data, scan fresh chains, or review the API preset before changing thresholds.</td></tr>}</tbody></table></div>
        {results?.info.failed.length ? <div className="border-t border-slate-800 px-4 py-3 text-[10px] text-amber-300">Unavailable scans: {results.info.failed.slice(0, 5).map((item) => `${item.ticker} (${item.error})`).join(" · ")}</div> : null}</section>

      {(results?.earningsWatch.length || results?.heldBackByEarnings.length) ? <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><div className="flex items-center gap-2 text-xs font-bold text-amber-200"><CalendarClock className="h-4 w-4" />Upcoming earnings watch</div><div className="mt-3 flex flex-wrap gap-2">{results?.earningsWatch.slice(0, 12).map((item) => <span key={item.g.row.ticker} className="rounded-lg border border-amber-500/10 bg-slate-950/50 px-2.5 py-1.5 text-[10px] text-amber-100">{item.g.row.ticker} · {item.days}d {item.estimated ? "· est." : ""}</span>)}</div></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-300"><ShieldAlert className="h-4 w-4 text-rose-300" />Held back by earnings filter</div><div className="mt-3 flex flex-wrap gap-2">{results?.heldBackByEarnings.slice(0, 12).map((item) => <span key={item.ticker} className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[10px] text-slate-400">{item.ticker} · {item.days == null ? "date unknown" : `${item.days}d`}</span>)}</div></div></section> : null}

      {chain && <section className="rounded-xl border border-cyan-500/20 bg-slate-900 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-white">{chain.symbol} option-chain snapshot</h3><p className="mt-1 text-[10px] text-slate-500">Underlying {cash(chain.price)} · {chain.source} · {chain.fetchedAt ? new Date(chain.fetchedAt).toLocaleString() : "timestamp unavailable"} {chain.stale ? "· cached/stale" : ""}</p></div><button onClick={() => { setChain(null); setChainTicker(null); }} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-white">Close</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{chain.contracts.slice(0, 16).map((contract, index) => <div key={`${contract.type}-${contract.expiration}-${contract.strike}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="flex justify-between text-[10px] uppercase text-slate-500"><span>{contract.type}</span><span>{contract.expiration}</span></div><div className="mt-1 font-mono text-sm font-bold text-white">${contract.strike.toFixed(2)}</div><div className="mt-1 font-mono text-[10px] text-slate-400">Bid {cash(contract.bid)} · Ask {cash(contract.ask)}</div><div className="mt-1 text-[10px] text-slate-600">Δ {contract.delta?.toFixed(2) ?? "N/A"} · IV {pct(contract.iv)} · OI {contract.oi?.toLocaleString() ?? "N/A"}</div></div>)}</div>{chain.contracts.length === 0 && <p className="mt-4 text-xs text-slate-500">Provider returned no contracts for the selected date range.</p>}</section>}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><h3 className="text-sm font-bold text-white">Saved wheel positions</h3><p className="mt-1 text-[10px] text-slate-500">Manual journal entries—not connected to a brokerage account.</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-400">{positions.length} entries</span></div><div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Ticker / side", "Strike", "Expiration", "Premium", "Qty", "Opened", "Status", "Actions"].map((item) => <th key={item} className="px-3 py-3 font-semibold">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{positions.map((position) => <tr key={position.id} className="hover:bg-slate-800/40"><td className="px-3 py-3"><span className="font-mono font-bold text-white">{position.ticker}</span><div className="text-[9px] text-slate-500">{position.side.replaceAll("_", " ")}</div></td><td className="px-3 py-3 font-mono text-slate-300">${position.strike.toFixed(2)}</td><td className="px-3 py-3 font-mono text-slate-400">{position.expiration}</td><td className="px-3 py-3 font-mono text-emerald-300">{cash(position.premium)}</td><td className="px-3 py-3 font-mono text-slate-300">{position.quantity}</td><td className="px-3 py-3 font-mono text-slate-400">{position.openedAt}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[9px] ${position.side === "closed" ? "bg-slate-800 text-slate-400" : "bg-emerald-500/10 text-emerald-300"}`}>{position.closedAt ? `Closed ${position.closedAt}` : "Open"}</span></td><td className="px-3 py-3"><div className="flex items-center gap-1">{position.side !== "closed" && <button onClick={() => void closePosition(position)} disabled={saving} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[9px] text-slate-300 hover:text-white disabled:opacity-40"><CheckCircle2 className="h-3 w-3" />Close</button>}<button onClick={() => void deletePosition(position)} disabled={saving} className="rounded-md border border-rose-500/20 p-1 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40" aria-label="Delete saved position"><Trash2 className="h-3 w-3" /></button></div></td></tr>)}{positions.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-xs text-slate-500">No saved wheel entries. Log a position with the form.</td></tr>}</tbody></table></div></div>
        <form ref={journalFormRef} onSubmit={savePosition} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold text-white">Log a wheel trade</h3></div><div className="mt-3 space-y-2"><label className="block text-[10px] text-slate-500">Ticker<input required maxLength={10} value={entry.ticker} onChange={(event) => setEntry({ ...entry, ticker: event.target.value.toUpperCase() })} className={inputClass + " mt-1"} placeholder="AAPL" /></label><label className="block text-[10px] text-slate-500">Lifecycle stage<select value={entry.side} onChange={(event) => setEntry({ ...entry, side: event.target.value })} className={inputClass + " mt-1"}><option value="put_sold">Cash-secured put sold</option><option value="assigned">Assigned shares</option><option value="call_sold">Covered call sold</option><option value="closed">Closed trade</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">Strike<input required type="number" min="0.01" step="any" value={entry.strike} onChange={(event) => setEntry({ ...entry, strike: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Expiration<input required type="date" value={entry.expiration} onChange={(event) => setEntry({ ...entry, expiration: event.target.value })} className={inputClass + " mt-1"} /></label></div><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">Premium / share<input required type="number" min="0" step="any" value={entry.premium} onChange={(event) => setEntry({ ...entry, premium: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Contracts<input required type="number" min="1" max="10000" step="1" value={entry.quantity} onChange={(event) => setEntry({ ...entry, quantity: event.target.value })} className={inputClass + " mt-1"} /></label></div><label className="block text-[10px] text-slate-500">Opened<input required type="date" value={entry.openedAt} onChange={(event) => setEntry({ ...entry, openedAt: event.target.value })} className={inputClass + " mt-1"} /></label><label className="block text-[10px] text-slate-500">Notes<input maxLength={1000} value={entry.notes} onChange={(event) => setEntry({ ...entry, notes: event.target.value })} className={inputClass + " mt-1"} placeholder="Optional" /></label><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Save journal entry</button></div></form>
      </section>
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-amber-100/70"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />Option bid/ask quotes are indicative and may be delayed. Annualized return is a simple premium-to-cash calculation, not a forecast. The scanner is educational, does not route orders, and does not guarantee an assignment or outcome.</div>
      {detailTicker && <LiveWheelDetailView ticker={detailTicker} onClose={() => setDetailTicker(null)} onUseContract={(contract, costBasis) => prefillPosition(detailTicker, contract, costBasis)} />}
    </div>
  );
}
