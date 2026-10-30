import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, CircleHelp, Database, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { LiveWheelDetailView } from "./LiveWheelDetailView";
import { LiveWheelChainModal } from "./LiveWheelChainModal";
import { WheelCandidateResults } from "./WheelCandidateResults";
import { WheelFilterPanel } from "./WheelFilterPanel";
import { DEFAULT_WHEEL_FILTERS, DEFAULT_WHEEL_FILTER_QUERY, serializeWheelFilterState, type WheelFilterState } from "./wheel-filter-state";
import type { LiveWheelResults } from "./wheel-types";
import type { OptionContract } from "../../lib/wheel";

type WheelPosition = { id: string; ticker: string; side: "put_sold" | "assigned" | "call_sold" | "closed"; strike: number; expiration: string; premium: number; quantity: number; openedAt: string; closedAt: string | null; costBasis: number | null; notes: string | null; createdAt: string };
type Chain = { symbol: string; price: number; nextEarnings: string | null; source: string; fetchedAt: string | null; stale: boolean; fallbackReasons?: string[]; contracts: OptionContract[] };
const cash = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(1)}%`;
const inputClass = "w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

export function LiveWheelView({
  initialDetailTicker = null,
  onInitialDetailTickerOpened,
  onResultsChange,
  onResultsLoadingChange,
}: {
  initialDetailTicker?: string | null;
  onInitialDetailTickerOpened?: () => void;
  onResultsChange?: (results: LiveWheelResults | null) => void;
  onResultsLoadingChange?: (loading: boolean) => void;
}) {
  const [results, setResults] = useState<LiveWheelResults | null>(null);
  const [positions, setPositions] = useState<WheelPosition[]>([]);
  const [filterValues, setFilterValues] = useState<WheelFilterState>(DEFAULT_WHEEL_FILTERS);
  const [filterQuery, setFilterQuery] = useState(DEFAULT_WHEEL_FILTER_QUERY);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [chain, setChain] = useState<Chain | null>(null);
  const [chainTicker, setChainTicker] = useState<string | null>(null);
  const [chainModalTicker, setChainModalTicker] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"refresh" | "scan" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [entry, setEntry] = useState({ ticker: "", side: "put_sold", strike: "", expiration: "", premium: "", quantity: "1", costBasis: "", openedAt: new Date().toISOString().slice(0, 10), notes: "" });
  const journalFormRef = useRef<HTMLFormElement>(null);
  const chainRequestIdRef = useRef(0);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    if (!initialDetailTicker) return;
    const timer = window.setTimeout(() => {
      setDetailTicker(initialDetailTicker);
      onInitialDetailTickerOpened?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialDetailTicker, onInitialDetailTickerOpened]);

  const load = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true); setError(null);
    onResultsChange?.(null);
    onResultsLoadingChange?.(true);
    const resultsUrl = `/api/wheel/results${filterQuery ? `?${filterQuery}` : ""}`;
    const [scanResult, positionResult] = await Promise.allSettled([requestJson<LiveWheelResults>(resultsUrl), requestJson<{ positions: WheelPosition[] }>("/api/wheel/positions")]);
    if (loadRequestIdRef.current !== requestId) return;
    if (scanResult.status === "fulfilled") {
      setResults(scanResult.value);
      onResultsChange?.(scanResult.value);
    }
    if (positionResult.status === "fulfilled") setPositions(positionResult.value.positions ?? []);
    const failures = [scanResult, positionResult].filter((item) => item.status === "rejected") as PromiseRejectedResult[];
    if (failures.length) setError(failures.map((item) => item.reason instanceof Error ? item.reason.message : "Request failed").join("; "));
    setLoading(false);
    onResultsLoadingChange?.(false);
  }, [filterQuery, onResultsChange, onResultsLoadingChange]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      loadRequestIdRef.current += 1;
      onResultsLoadingChange?.(false);
    };
  }, [load, onResultsLoadingChange]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilterQuery(serializeWheelFilterState(filterValues));
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
    const requestId = chainRequestIdRef.current + 1;
    chainRequestIdRef.current = requestId;
    setChainModalTicker(ticker);
    setChainTicker(ticker);
    setChain(null);
    setChainError(null);
    setError(null);
    try {
      const snapshot = await requestJson<Chain>(`/api/wheel/chain?symbol=${encodeURIComponent(ticker)}&type=both&dteMin=7&dteMax=70`);
      if (chainRequestIdRef.current === requestId) setChain(snapshot);
    } catch (e) {
      if (chainRequestIdRef.current === requestId) setChainError(e instanceof Error ? e.message : "Option chain could not be loaded");
    } finally {
      // Clear only this request's loading state; a newer ticker may still be loading.
      if (chainRequestIdRef.current === requestId) setChainTicker(null);
    }
  };

  const closeChainModal = () => {
    // Invalidate any in-flight fetch so closing the dialog cannot reopen it on late response.
    chainRequestIdRef.current += 1;
    setChainModalTicker(null);
    setChainTicker(null);
    setChain(null);
    setChainError(null);
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
      costBasis: contract.type === "put"
        ? ""
        : costBasis != null
          ? String(costBasis)
          : current.ticker.toUpperCase() === ticker.toUpperCase() ? current.costBasis : "",
      openedAt: new Date().toISOString().slice(0, 10),
      notes: `Prefilled from ${contract.symbol}; review quote and enter actual fill before saving.`,
    }));
    setDetailTicker(null);
    setMessage(`${ticker.toUpperCase()} ${contract.type} prefilled in the journal form. Review the details and actual fill before saving.`);
    window.setTimeout(() => journalFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const useChainContract = (contract: OptionContract) => {
    const ticker = chainModalTicker;
    if (!ticker) return;
    closeChainModal();
    prefillPosition(ticker, contract, null);
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
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/25 p-5 shadow-xl"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2"><Activity className="h-6 w-6 shrink-0 text-emerald-400" /><h1 className="text-2xl font-extrabold text-white">Live Provider Scanner &amp; Journal</h1></div><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">The scanner filters real option-chain quotes against delta, liquidity, spread, earnings and return rules. Refresh stock fundamentals and scan option chains in small batches; saved entries are separate from candidate ideas.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} disabled={loading || action !== null} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Reload</button><button onClick={() => void runBatch("refresh")} disabled={action !== null} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50"><Database className={`h-3.5 w-3.5 ${action === "refresh" ? "animate-pulse" : ""}`} />{action === "refresh" ? "Refreshing…" : "Hydrate 8 stocks"}</button><button onClick={() => void runBatch("scan")} disabled={action !== null} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${action === "scan" ? "animate-spin" : ""}`} />{action === "scan" ? "Scanning…" : "Scan 8 chains"}</button></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ label: "Universe stocks", value: results ? `${results.info.universe}` : "—" }, { label: "Stocks with chain scans", value: results ? `${results.info.scanned}` : "—" }, { label: "Waiting on data", value: results ? `${results.info.waiting}` : "—" }, { label: "Qualified put candidates", value: results ? `${results.rows.length}` : "—" }].map((item) => <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</div><div className="mt-1 font-mono text-lg font-bold text-slate-100">{item.value}</div></div>)}</div>
      </section>
      {error && <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}. These services require PostgreSQL with the included schema; provider responses can be delayed, rate-limited or unavailable.</div>}
      {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{message}</div>}
      {results && <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1">Hydrated {results.info.hydrated}/{results.info.universe}</span><span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1">Scanned {results.info.scanned}/{results.info.eligible}</span><span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1">Fallback sources {results.info.fallbacks}</span><span>Generated {new Date(results.generatedAt).toLocaleString()}</span></div>}

      <WheelFilterPanel
        filterValues={filterValues}
        setFilterValues={setFilterValues}
        sectors={results?.sectors ?? []}
        onSubmit={applyFilters}
        onReset={() => {
          setFilterValues(DEFAULT_WHEEL_FILTERS);
          setFilterQuery(DEFAULT_WHEEL_FILTER_QUERY);
        }}
      />

      <WheelCandidateResults
        results={results}
        loading={loading}
        viewMode={viewMode}
        setViewMode={setViewMode}
        chainTicker={chainTicker}
        onOpenDetail={setDetailTicker}
        onLoadChain={(ticker) => void loadChain(ticker)}
      />

      {(results?.earningsWatch.length || results?.heldBackByEarnings.length) ? <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><div className="flex items-center gap-2 text-xs font-bold text-amber-200"><CalendarClock className="h-4 w-4" />Upcoming earnings watch</div><div className="mt-3 flex flex-wrap gap-2">{results?.earningsWatch.slice(0, 12).map((item) => <span key={item.g.row.ticker} className="rounded-lg border border-amber-500/10 bg-slate-950/50 px-2.5 py-1.5 text-[10px] text-amber-100">{item.g.row.ticker} · {item.days}d {item.estimated ? "· est." : ""}</span>)}</div></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2 text-xs font-bold text-slate-300"><ShieldAlert className="h-4 w-4 text-rose-300" />Held back by earnings filter</div><div className="mt-3 flex flex-wrap gap-2">{results?.heldBackByEarnings.slice(0, 12).map((item) => <span key={item.ticker} className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[10px] text-slate-400">{item.ticker} · {item.days == null ? "date unknown" : `${item.days}d`}</span>)}</div></div></section> : null}

      {chainModalTicker && (
        <LiveWheelChainModal
          key={chainModalTicker}
          ticker={chainModalTicker}
          chain={chain}
          loading={chainTicker === chainModalTicker}
          error={chainError}
          onClose={closeChainModal}
          onRetry={() => void loadChain(chainModalTicker)}
          onUseContract={useChainContract}
        />
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><h3 className="text-sm font-bold text-white">Saved wheel positions</h3><p className="mt-1 text-[10px] text-slate-500">Manual journal entries—not connected to a brokerage account.</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-400">{positions.length} entries</span></div><div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Ticker / side", "Strike", "Expiration", "Premium", "Qty", "Opened", "Status", "Actions"].map((item) => <th key={item} className="px-3 py-3 font-semibold">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{positions.map((position) => <tr key={position.id} className="hover:bg-slate-800/40"><td className="px-3 py-3"><span className="font-mono font-bold text-white">{position.ticker}</span><div className="text-[9px] text-slate-500">{position.side.replaceAll("_", " ")}</div></td><td className="px-3 py-3 font-mono text-slate-300">${position.strike.toFixed(2)}</td><td className="px-3 py-3 font-mono text-slate-400">{position.expiration}</td><td className="px-3 py-3 font-mono text-emerald-300">{cash(position.premium)}</td><td className="px-3 py-3 font-mono text-slate-300">{position.quantity}</td><td className="px-3 py-3 font-mono text-slate-400">{position.openedAt}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[9px] ${position.side === "closed" ? "bg-slate-800 text-slate-400" : "bg-emerald-500/10 text-emerald-300"}`}>{position.closedAt ? `Closed ${position.closedAt}` : "Open"}</span></td><td className="px-3 py-3"><div className="flex items-center gap-1">{position.side !== "closed" && <button onClick={() => void closePosition(position)} disabled={saving} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:text-white disabled:opacity-40"><CheckCircle2 className="h-3 w-3" />Close</button>}<button onClick={() => void deletePosition(position)} disabled={saving} className="rounded-md border border-rose-500/20 p-1 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40" aria-label="Delete saved position"><Trash2 className="h-3 w-3" /></button></div></td></tr>)}{positions.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-xs text-slate-500">No saved wheel entries. Log a position with the form.</td></tr>}</tbody></table></div></div>
        <form ref={journalFormRef} onSubmit={savePosition} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold text-white">Log a wheel trade</h3></div><div className="mt-3 space-y-2"><label className="block text-[10px] text-slate-500">Ticker<input required maxLength={10} value={entry.ticker} onChange={(event) => setEntry({ ...entry, ticker: event.target.value.toUpperCase() })} className={inputClass + " mt-1"} placeholder="AAPL" /></label><label className="block text-[10px] text-slate-500">Lifecycle stage<select value={entry.side} onChange={(event) => setEntry({ ...entry, side: event.target.value })} className={inputClass + " mt-1"}><option value="put_sold">Cash-secured put sold</option><option value="assigned">Assigned shares</option><option value="call_sold">Covered call sold</option><option value="closed">Closed trade</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">Strike<input required type="number" min="0.01" step="any" value={entry.strike} onChange={(event) => setEntry({ ...entry, strike: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Expiration<input required type="date" value={entry.expiration} onChange={(event) => setEntry({ ...entry, expiration: event.target.value })} className={inputClass + " mt-1"} /></label></div><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-500">Premium / share<input required type="number" min="0" step="any" value={entry.premium} onChange={(event) => setEntry({ ...entry, premium: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Contracts<input required type="number" min="1" max="10000" step="1" value={entry.quantity} onChange={(event) => setEntry({ ...entry, quantity: event.target.value })} className={inputClass + " mt-1"} /></label></div><label className="block text-[10px] text-slate-500">Opened<input required type="date" value={entry.openedAt} onChange={(event) => setEntry({ ...entry, openedAt: event.target.value })} className={inputClass + " mt-1"} /></label><label className="block text-[10px] text-slate-500">Notes<input maxLength={1000} value={entry.notes} onChange={(event) => setEntry({ ...entry, notes: event.target.value })} className={inputClass + " mt-1"} placeholder="Optional" /></label><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Save journal entry</button></div></form>
      </section>
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-amber-100/70"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />Option bid/ask quotes are indicative and may be delayed. Annualized return is a simple premium-to-cash calculation, not a forecast. The scanner is educational, does not route orders, and does not guarantee an assignment or outcome.</div>
      {detailTicker && <LiveWheelDetailView ticker={detailTicker} onClose={() => setDetailTicker(null)} onUseContract={(contract, costBasis) => prefillPosition(detailTicker, contract, costBasis)} />}
    </div>
  );
}
