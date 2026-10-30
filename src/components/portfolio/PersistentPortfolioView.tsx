import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowDownUp, BadgeCheck, BriefcaseBusiness, FileUp, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";

type Portfolio = { id: string; name: string; brokerType: string; accountNumberMasked: string | null; currency: string; syncStatus: string; lastSyncedAt: string | null; isDemo: boolean; createdAt: string; updatedAt: string };
type Position = { id: string; portfolioId: string; ticker: string; assetType: string; quantity: number; averageCostBasis: number; purchaseDate: string | null; currentPrice: number | null; marketValue: number | null; unrealizedGain: number | null; unrealizedGainPct: number | null; name?: string; category?: string; expenseRatio?: number | null; ttmYield?: number | null; annualDividendIncome: number; erosionLevel?: string; portfolioName?: string; brokerType?: string; weight: number; dayChange?: number | null; dayChangePct?: number | null; priceSource: "live" | "last_close" | "stored" | "cost_basis" };
type Analytics = { portfolioCount: number; positionCount: number; totalMarketValue: number; totalCostBasis: number; totalUnrealizedGain: number; totalUnrealizedGainPct: number; todayPl: number; todayPlPct: number; annualDividendIncome: number; portfolioYieldPct: number; weightedExpenseRatio: number; annualFeeDollars: number; positions: Position[]; portfolios: Portfolio[]; benchmark: { portfolioBeta: number | null; portfolioSharpe: number | null; statsBasis: string | null }; assetClassBreakdown: { assetClass: string; weight: number; marketValue: number }[]; sectorBreakdown: { sector: string; weight: number; marketValue: number }[]; monthlyDividends: { month: string; amount: number }[]; cashFlow?: { totalDeposits: number; totalWithdrawals: number; netDeposits: number; totalDividends: number; totalFees: number; realizedGain: number; realizedGainPct: number | null }; depositAware?: { mwr: number | null; mwrLabel: string; gainVsDeposits: number; gainVsDepositsPct: number | null }; overlap?: { tickers: string[]; cells: { a: string; b: string; overlap: number; overlapPct: number; common: { symbol: string; wa: number; wb: number }[] }[] }; erosionAlerts: { ticker: string; level: string; weight: number; marketValue: number }[] };
type Transaction = { id: string; ticker: string | null; type: string; quantity: number | null; price: number | null; amount: number; fee: number | null; transactionDate: string; notes: string | null };
type TransactionResponse = { transactions: Transaction[] };

const brokers = ["manual", "schwab", "fidelity", "vanguard", "ninjatrader", "moomoo"];
const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(2)}%`;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
  return body as T;
}

function Field({ label, value, accent, hint }: { label: string; value: string; accent?: string; hint?: string | null }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div><div className={`mt-1 font-mono text-sm font-bold ${accent ?? "text-slate-100"}`}>{value}</div>{hint && <div className="mt-1 truncate text-[9px] text-slate-500" title={hint}>{hint}</div>}</div>;
}
const inputClass = "w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-emerald-500/60";

export function PersistentPortfolioView() {
  const [portfolioId, setPortfolioId] = useState("all");
  const [allPortfolios, setAllPortfolios] = useState<Portfolio[]>([]);
  const [summary, setSummary] = useState<Analytics | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPositionForm, setShowPositionForm] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [portfolioName, setPortfolioName] = useState("");
  const [brokerType, setBrokerType] = useState("manual");
  const [position, setPosition] = useState({ ticker: "", quantity: "", averageCostBasis: "", purchaseDate: new Date().toISOString().slice(0, 10), assetType: "ETF" });
  const [transaction, setTransaction] = useState({ type: "BUY", ticker: "", quantity: "", price: "", amount: "", fee: "0", transactionDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [csvText, setCsvText] = useState("");
  const [csvName, setCsvName] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const all = await requestJson<Analytics>("/api/portfolios");
      setAllPortfolios(all.portfolios ?? []);
      const detail = portfolioId !== "all" ? await requestJson<Analytics>(`/api/portfolios/${encodeURIComponent(portfolioId)}`) : all;
      setSummary(detail);
      if (portfolioId !== "all") {
        const tx = await requestJson<TransactionResponse>(`/api/portfolios/${encodeURIComponent(portfolioId)}/transactions`);
        setTransactions(tx.transactions ?? []);
      } else setTransactions([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portfolio data could not be loaded");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const selectedPortfolio = useMemo(() => allPortfolios.find((item) => item.id === portfolioId), [allPortfolios, portfolioId]);
  const positions = summary?.positions ?? [];
  const monthlyDividendMax = Math.max(1, ...(summary?.monthlyDividends ?? []).map((item) => item.amount));
  const overlapPairs = (summary?.overlap?.cells ?? []).filter((cell) => cell.a !== cell.b && cell.overlap > 0).sort((a, b) => b.overlap - a.overlap).slice(0, 5);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(null); setMessage(null);
    try { await action(); setMessage(success); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  };

  const createPortfolio = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const result = await requestJson<{ portfolio: Portfolio }>("/api/portfolios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: portfolioName, brokerType }) });
      setPortfolioName("");
      setPortfolioId(result.portfolio.id);
    }, "Portfolio created.");
  };

  const createDemo = async () => runAction(async () => {
    const result = await requestJson<{ portfolioId: string }>("/api/portfolios/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brokerType: brokerType === "manual" ? "schwab" : brokerType, connectionMethod: "sandbox" }) });
    setPortfolioId(result.portfolioId);
  }, "Clearly labeled sample account created. Replace it with your own import when ready.");

  const addPosition = async (event: FormEvent) => {
    event.preventDefault();
    if (portfolioId === "all") return setError("Select a portfolio before adding a position.");
    await runAction(async () => {
      await requestJson(`/api/portfolios/${encodeURIComponent(portfolioId)}/positions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...position, ticker: position.ticker.toUpperCase(), quantity: Number(position.quantity), averageCostBasis: Number(position.averageCostBasis) }) });
      setPosition({ ticker: "", quantity: "", averageCostBasis: "", purchaseDate: new Date().toISOString().slice(0, 10), assetType: "ETF" });
      setShowPositionForm(false);
    }, "Position saved to the portfolio ledger.");
  };

  const importCsv = async () => {
    if (!csvText || portfolioId === "all") return setError("Choose a portfolio and a CSV statement first.");
    await runAction(async () => {
      const result = await requestJson<{ importedCount: number; brokerDetected: string; warnings: string[] }>(`/api/portfolios/${encodeURIComponent(portfolioId)}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csvContent: csvText, mode: "add" }) });
      setMessage(`${result.importedCount} positions imported · broker format: ${result.brokerDetected}${result.warnings.length ? ` · ${result.warnings[0]}` : ""}`);
      setCsvText(""); setCsvName("");
    }, "CSV import completed.");
  };

  const addTransaction = async (event: FormEvent) => {
    event.preventDefault();
    if (portfolioId === "all") return setError("Select a portfolio before adding a transaction.");
    await runAction(async () => {
      await requestJson(`/api/portfolios/${encodeURIComponent(portfolioId)}/transactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...transaction, ticker: transaction.ticker || undefined, quantity: transaction.quantity || undefined, price: transaction.price || undefined, amount: Number(transaction.amount), fee: Number(transaction.fee || 0) }) });
      setTransaction({ type: "BUY", ticker: "", quantity: "", price: "", amount: "", fee: "0", transactionDate: new Date().toISOString().slice(0, 10), notes: "" });
      setShowTxForm(false);
    }, "Transaction recorded and portfolio metrics recalculated.");
  };

  const sync = () => runAction(async () => {
    if (portfolioId === "all") throw new Error("Select a portfolio to refresh prices.");
    await requestJson(`/api/portfolios/${encodeURIComponent(portfolioId)}/sync`, { method: "POST" });
  }, "Prices refreshed. Broker positions are not automatically synced.");

  const removePortfolio = async () => {
    if (!selectedPortfolio || !window.confirm(`Delete ${selectedPortfolio.name} and its stored ledger?`)) return;
    await runAction(async () => {
      await requestJson(`/api/portfolios/${encodeURIComponent(selectedPortfolio.id)}`, { method: "DELETE" });
      setPortfolioId("all");
    }, "Portfolio deleted.");
  };

  const sourceLabel = (source: Position["priceSource"]) => source === "live" ? "Live quote" : source === "last_close" ? "Last close" : source === "stored" ? "Stored price" : "Cost basis only";

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/25 p-5 shadow-xl sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300"><BriefcaseBusiness className="h-4 w-4" /> Persistent portfolio workspace</div><h1 className="mt-2 text-2xl font-extrabold text-white">Portfolio Accounts & Ledger</h1><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400 sm:text-sm">Positions, transactions, CSV imports, daily repricing, allocation, income and risk analytics are stored in PostgreSQL. Broker links are not live; sample accounts are clearly labeled.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Reload</button><a href={`/api/portfolios/export?id=${encodeURIComponent(portfolioId)}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white"><ArrowDownToLine className="h-3.5 w-3.5" />Export CSV</a>{portfolioId !== "all" && <button onClick={() => void sync()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Reprice</button>}</div></div>
      </section>

      {error && <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}. Configure PostgreSQL and apply the included Drizzle migrations before using persistent accounts.</div>}
      {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-sm font-bold text-white">Account snapshot</h3><p className="mt-1 text-[10px] text-slate-500">Market value uses the best available price and identifies the source for each holding.</p></div><select value={portfolioId} onChange={(event) => setPortfolioId(event.target.value)} className={inputClass + " sm:max-w-sm"}><option value="all">All portfolios</option>{allPortfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}{portfolio.isDemo ? " · Sample" : ""}</option>)}</select></div>
          {summary && <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Field label="Market value" value={money(summary.totalMarketValue)} /><Field label="Cost basis" value={money(summary.totalCostBasis)} /><Field label="Unrealized P/L" value={money(summary.totalUnrealizedGain)} accent={summary.totalUnrealizedGain >= 0 ? "text-emerald-300" : "text-rose-300"} /><Field label="Today’s P/L" value={money(summary.todayPl)} accent={summary.todayPl >= 0 ? "text-emerald-300" : "text-rose-300"} /><Field label="Annual dividend estimate" value={money(summary.annualDividendIncome)} accent="text-cyan-300" /><Field label="Portfolio yield" value={percent(summary.portfolioYieldPct)} /><Field label="Weighted expense" value={percent(summary.weightedExpenseRatio)} /><Field label="Annual fee drag" value={money(summary.annualFeeDollars)} /><Field label="Beta / Sharpe" value={`${summary.benchmark.portfolioBeta?.toFixed(2) ?? "N/A"} / ${summary.benchmark.portfolioSharpe?.toFixed(2) ?? "N/A"}`} hint={summary.benchmark.statsBasis ?? "Insufficient stored history"} /><Field label="Money-weighted return" value={percent(summary.depositAware?.mwr)} hint={summary.depositAware?.mwrLabel ?? "Add dated cash flows for an IRR"} /></div>}
          {summary && <>
            <div className="grid gap-3 xl:grid-cols-3">
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h3 className="text-xs font-bold text-white">Asset-class allocation</h3><div className="mt-3 space-y-3">{summary.assetClassBreakdown.map((item) => <div key={item.assetClass}><div className="flex justify-between gap-3 text-[10px]"><span className="text-slate-400">{item.assetClass}</span><span className="font-mono text-slate-300">{percent(item.weight)} · {money(item.marketValue)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, item.weight * 100))}%` }} /></div></div>)}{summary.assetClassBreakdown.length === 0 && <p className="text-xs text-slate-500">No allocation data available.</p>}</div></section>
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><h3 className="text-xs font-bold text-white">Sector look-through · top 8</h3><div className="mt-3 space-y-2.5">{summary.sectorBreakdown.map((item) => <div key={item.sector}><div className="flex justify-between gap-3 text-[10px]"><span className="truncate text-slate-400">{item.sector}</span><span className="shrink-0 font-mono text-slate-300">{percent(item.weight)}</span></div><div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(0, Math.min(100, item.weight * 100))}%` }} /></div></div>)}{summary.sectorBreakdown.length === 0 && <p className="text-xs text-slate-500">Provider sector weights not stored yet.</p>}</div></section>
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-bold text-white">Estimated dividend cadence</h3><p className="mt-1 text-[10px] text-slate-500">Annual income distributed by reported frequency; not a payment-date forecast.</p></div><span className="font-mono text-[10px] text-emerald-300">{money(summary.annualDividendIncome)}/yr</span></div><div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">{summary.monthlyDividends.map((item) => <div key={item.month} className="text-center"><div className="flex h-16 items-end justify-center rounded-md bg-slate-950 p-1"><div className="w-full rounded-sm bg-gradient-to-t from-emerald-700 to-emerald-400" style={{ height: `${Math.max(3, (item.amount / monthlyDividendMax) * 100)}%` }} title={`${item.month}: ${money(item.amount)}`} /></div><div className="mt-1 text-[9px] text-slate-500">{item.month}</div><div className="font-mono text-[10px] text-slate-500">{money(item.amount)}</div></div>)}</div></section>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-xs font-bold text-white">Ledger cash flow</h3><p className="mt-1 text-[10px] text-slate-500">Based on dated transactions; unrealized market movement is reported separately.</p></div><span className="font-mono text-xs text-cyan-300">Net deposits {money(summary.cashFlow?.netDeposits)}</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ label: "Deposits", value: money(summary.cashFlow?.totalDeposits) }, { label: "Withdrawals", value: money(summary.cashFlow?.totalWithdrawals) }, { label: "Dividends logged", value: money(summary.cashFlow?.totalDividends) }, { label: "Fees", value: money(summary.cashFlow?.totalFees) }].map((item) => <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950 p-2.5"><div className="text-[9px] uppercase tracking-wider text-slate-500">{item.label}</div><div className="mt-1 font-mono text-xs text-slate-300">{item.value}</div></div>)}</div><div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500"><span>Gain vs deposits: <b className="font-mono text-slate-300">{money(summary.depositAware?.gainVsDeposits)}</b></span><span>Realized P/L: <b className="font-mono text-slate-300">{money(summary.cashFlow?.realizedGain)}</b></span><span>Realized return: <b className="font-mono text-slate-300">{percent(summary.cashFlow?.realizedGainPct)}</b></span></div></section>
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /><h3 className="text-xs font-bold text-white">NAV erosion & holdings overlap</h3></div>{summary.erosionAlerts.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{summary.erosionAlerts.map((item) => <span key={item.ticker} className={`rounded-lg border px-2.5 py-1.5 text-[10px] ${item.level === "Severe" ? "border-rose-500/20 bg-rose-500/10 text-rose-200" : "border-amber-500/20 bg-amber-500/10 text-amber-200"}`}>{item.ticker} · {item.level} · {percent(item.weight)}</span>)}</div> : <p className="mt-3 text-[10px] text-slate-500">No moderate/severe erosion flags in the stored fund data.</p>}{summary.overlap && <><div className="mt-4 border-t border-slate-800 pt-3 text-[10px] font-semibold text-slate-400">Largest estimated top-holdings overlap</div>{overlapPairs.length ? <div className="mt-2 space-y-2">{overlapPairs.map((cell) => <div key={`${cell.a}-${cell.b}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 px-3 py-2 text-[10px]"><span className="font-mono text-slate-300">{cell.a} ↔ {cell.b}</span><span className="font-mono text-amber-300">{cell.overlapPct.toFixed(1)}%</span><span className="hidden truncate text-slate-500 sm:block">{cell.common.slice(0, 3).map((item) => item.symbol).join(", ")}</span></div>)}</div> : <p className="mt-2 text-[10px] text-slate-500">Top-10 holdings overlap is not available for these funds.</p>}<p className="mt-2 text-[10px] text-slate-500">Overlap is a lower-bound estimate from provider-reported top holdings, not full holdings.</p></>}</section>
            </div>
          </>}
          {selectedPortfolio && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-300" /><div><div className="text-xs font-semibold text-slate-200">{selectedPortfolio.name}</div><div className="mt-0.5 text-[10px] text-slate-500">{selectedPortfolio.brokerType} · {selectedPortfolio.accountNumberMasked ?? "No account number"} · {selectedPortfolio.isDemo ? "Sample account" : selectedPortfolio.syncStatus}</div></div>{selectedPortfolio.isDemo && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-300">DEMO</span>}</div><div className="flex gap-2"><button onClick={() => setShowPositionForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:text-white"><Plus className="h-3 w-3" />Position</button><button onClick={() => setShowTxForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:text-white"><ArrowDownUp className="h-3 w-3" />Transaction</button><button onClick={() => void removePortfolio()} className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-1.5 text-rose-300 hover:bg-rose-500/10" aria-label="Delete portfolio"><Trash2 className="h-3.5 w-3.5" /></button></div></div>}

          {showPositionForm && portfolioId !== "all" && <form onSubmit={addPosition} className="grid gap-2 rounded-xl border border-emerald-500/20 bg-slate-900 p-4 sm:grid-cols-6"><label className="text-[10px] text-slate-500">Ticker<input required maxLength={10} value={position.ticker} onChange={(event) => setPosition({ ...position, ticker: event.target.value.toUpperCase() })} className={inputClass + " mt-1"} placeholder="VOO" /></label><label className="text-[10px] text-slate-500">Quantity<input required type="number" min="0.0001" step="any" value={position.quantity} onChange={(event) => setPosition({ ...position, quantity: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Average cost<input required type="number" min="0" step="any" value={position.averageCostBasis} onChange={(event) => setPosition({ ...position, averageCostBasis: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Purchase date<input type="date" value={position.purchaseDate} onChange={(event) => setPosition({ ...position, purchaseDate: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Asset class<select value={position.assetType} onChange={(event) => setPosition({ ...position, assetType: event.target.value })} className={inputClass + " mt-1"}><option>ETF</option><option>EQUITY</option><option>BOND</option><option>CASH</option><option>FUTURES</option></select></label><button disabled={busy} className="self-end rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50">Save position</button></form>}

          {showTxForm && portfolioId !== "all" && <form onSubmit={addTransaction} className="grid gap-2 rounded-xl border border-cyan-500/20 bg-slate-900 p-4 sm:grid-cols-4"><label className="text-[10px] text-slate-500">Type<select value={transaction.type} onChange={(event) => setTransaction({ ...transaction, type: event.target.value })} className={inputClass + " mt-1"}><option>BUY</option><option>SELL</option><option>DIVIDEND</option><option>DEPOSIT</option><option>WITHDRAWAL</option></select></label><label className="text-[10px] text-slate-500">Ticker<input value={transaction.ticker} onChange={(event) => setTransaction({ ...transaction, ticker: event.target.value.toUpperCase() })} className={inputClass + " mt-1"} placeholder="Required for buy / sell" /></label><label className="text-[10px] text-slate-500">Quantity<input type="number" min="0" step="any" value={transaction.quantity} onChange={(event) => setTransaction({ ...transaction, quantity: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Price<input type="number" min="0" step="any" value={transaction.price} onChange={(event) => setTransaction({ ...transaction, price: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Amount<input required type="number" step="any" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Fee<input type="number" min="0" step="any" value={transaction.fee} onChange={(event) => setTransaction({ ...transaction, fee: event.target.value })} className={inputClass + " mt-1"} /></label><label className="text-[10px] text-slate-500">Date<input required type="date" value={transaction.transactionDate} onChange={(event) => setTransaction({ ...transaction, transactionDate: event.target.value })} className={inputClass + " mt-1"} /></label><button disabled={busy} className="self-end rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50">Record transaction</button></form>}

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="overflow-x-auto"><table className="min-w-[840px] w-full text-left text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Ticker", "Quantity", "Avg cost", "Price", "Value", "Unrealized P/L", "Weight", "Price basis"].map((item) => <th key={item} className="px-3 py-3 font-semibold">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/80">{loading && !summary ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading account ledger…</td></tr> : positions.map((item) => <tr key={item.id} className="hover:bg-slate-800/40"><td className="px-3 py-3"><div className="font-mono font-bold text-white">{item.ticker}</div><div className="mt-0.5 max-w-52 truncate text-[10px] text-slate-500">{item.name ?? item.assetType}</div></td><td className="px-3 py-3 font-mono text-slate-300">{item.quantity.toLocaleString()}</td><td className="px-3 py-3 font-mono text-slate-300">{money(item.averageCostBasis)}</td><td className="px-3 py-3 font-mono text-slate-300">{money(item.currentPrice)}</td><td className="px-3 py-3 font-mono text-slate-200">{money(item.marketValue)}</td><td className={`px-3 py-3 font-mono ${item.unrealizedGain != null && item.unrealizedGain < 0 ? "text-rose-300" : "text-emerald-300"}`}>{money(item.unrealizedGain)}<div className="text-[10px] text-slate-500">{percent(item.unrealizedGainPct)}</div></td><td className="px-3 py-3 font-mono text-slate-400">{percent(item.weight)}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] ${item.priceSource === "live" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : item.priceSource === "cost_basis" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-950 text-slate-400"}`}>{sourceLabel(item.priceSource)}</span>{item.erosionLevel && <div className="mt-1 text-[9px] text-slate-500">Erosion: {item.erosionLevel}</div>}</td></tr>)}{!loading && summary && positions.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No positions in this view. Create an account, add a position, or import a CSV statement.</td></tr>}</tbody></table></div></div>

          {portfolioId !== "all" && <details className="rounded-xl border border-slate-800 bg-slate-900 p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-slate-300"><span>Transaction journal · {transactions.length} recorded</span><ArrowDownUp className="h-4 w-4 text-cyan-300" /></summary><div className="mt-3 divide-y divide-slate-800">{transactions.slice(0, 20).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><div><span className="font-mono font-bold text-slate-200">{item.type}</span>{item.ticker && <span className="ml-2 font-mono text-emerald-300">{item.ticker}</span>}<div className="mt-0.5 text-[9px] text-slate-500">{item.transactionDate}{item.notes ? ` · ${item.notes}` : ""}</div></div><div className="text-right font-mono text-slate-300">{money(item.amount)}{item.quantity != null && <div className="text-[9px] text-slate-500">{item.quantity} units @ {money(item.price)}</div>}</div></div>)}{transactions.length === 0 && <p className="py-3 text-xs text-slate-500">No transactions recorded yet.</p>}</div></details>}
        </section>

        <aside className="space-y-4">
          <form onSubmit={createPortfolio} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold text-white">Create an account</h3></div><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Creates a ledger container; no broker credentials are requested or connected.</p><label className="mt-3 block text-[10px] text-slate-500">Account name<input required maxLength={80} value={portfolioName} onChange={(event) => setPortfolioName(event.target.value)} className={inputClass + " mt-1"} placeholder="Long-term ETF account" /></label><label className="mt-2 block text-[10px] text-slate-500">Broker / import format<select value={brokerType} onChange={(event) => setBrokerType(event.target.value)} className={inputClass + " mt-1"}>{brokers.map((broker) => <option key={broker} value={broker}>{broker}</option>)}</select></label><button disabled={busy} className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50">Create persistent account</button><button type="button" disabled={busy} onClick={() => void createDemo()} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50">Create labeled sample account</button></form>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2"><FileUp className="h-4 w-4 text-cyan-300" /><h3 className="text-xs font-bold text-white">Statement import</h3></div><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Supports Schwab, Fidelity, Vanguard, NinjaTrader, MooMoo and generic CSV. Import adds rows; missing cost or price data is rejected rather than guessed.</p><label className="mt-3 block cursor-pointer rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3 text-center text-[10px] text-slate-400 hover:border-cyan-500/40">{csvName || "Choose CSV file"}<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setCsvName(file.name); setCsvText(await file.text()); }} /></label><button onClick={() => void importCsv()} disabled={busy || !csvText || portfolioId === "all"} className="mt-2 w-full rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-40">Import into selected account</button>{portfolioId === "all" && <p className="mt-2 text-[10px] text-amber-300/80">Select a specific account above before importing.</p>}</div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-300" /><h3 className="text-xs font-bold text-white">Trust & pricing notes</h3></div><ul className="mt-3 space-y-2 text-[10px] leading-relaxed text-slate-500"><li>• Market prices are delayed provider quotes when available.</li><li>• Stored values show their data source; cost basis is not presented as a market quote.</li><li>• CSV imports and manual entries remain editable in the account ledger.</li><li>• Live SnapTrade / Plaid broker linking is not implemented; those methods return a not-supported response.</li><li>• Benchmark beta and Sharpe remain N/A until enough aligned history is stored.</li></ul></div>
        </aside>
      </div>
    </div>
  );
}
