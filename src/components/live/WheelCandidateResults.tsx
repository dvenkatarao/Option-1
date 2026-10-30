import { CircleHelp, LayoutGrid, List } from "lucide-react";
import type { LiveWheelResults, LiveWheelRow } from "./wheel-types";

const cash = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(1)}%`;
const timestamp = (value: string) => new Date(value).toLocaleString();

type ViewMode = "cards" | "table";

function Metric({ label, value, tone = "text-slate-100", title }: { label: string; value: string; tone?: string; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 break-words font-mono text-sm font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function CandidateCard({
  row,
  ivRank,
  chainLoading,
  onOpenDetail,
  onLoadChain,
}: {
  row: LiveWheelRow;
  ivRank: number | null | undefined;
  chainLoading: boolean;
  onOpenDetail: (ticker: string) => void;
  onLoadChain: (ticker: string) => void;
}) {
  const ticker = row.g.row.ticker;
  const delta = row.best.contract.delta == null ? "N/A" : row.best.contract.delta.toFixed(2);
  const score = Number.isFinite(row.best.score) ? row.best.score.toFixed(0) : "N/A";

  return (
    <article className="group flex min-w-0 flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg transition hover:border-emerald-500/50">
      <div className="min-w-0">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onOpenDetail(ticker)} className="font-mono text-xl font-extrabold leading-none text-white transition group-hover:text-emerald-400" aria-label={`Open ${ticker} detail workspace`}>{ticker}</button>
              <span title="Higher scores rank ahead when sorting by score; this is a ranking heuristic, not probability of profit." className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">Wheel Score {score}{score === "N/A" ? "" : " pts"}</span>
            </div>
            <p className="mt-1 break-words text-xs font-medium text-slate-400">{row.g.row.name ?? "Provider-backed stock"}</p>
          </div>
          <div className="shrink-0 text-right font-mono">
            <span className="text-sm font-bold text-slate-100">{cash(row.ctx.price)}</span>
            <span className="block text-[10px] uppercase tracking-wider text-slate-500">Underlying</span>
          </div>
        </header>

        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          {row.g.row.sector ?? "Sector unavailable"} · {row.ctx.nextEarnings ? `Earnings ${row.ctx.nextEarnings}${row.g.row.events?.earningsEstimated ? " · est." : ""}` : "Earnings unknown"}
        </p>

        <div className="my-3.5 grid grid-cols-3 gap-2 rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-2.5 font-mono text-xs">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quality grade</div>
            <div className="mt-0.5 break-words font-bold text-emerald-300">{row.g.grade ?? "N/A"}</div>
          </div>
          <div>
            <div title="Relative IV percentile for this ticker; higher can mean richer premium and higher expected movement/risk." className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">IV rank</div>
            <div className="mt-0.5 break-words font-bold text-cyan-300">{ivRank == null ? "N/A" : `${ivRank}%`}</div>
          </div>
          <div title="R = retirement, T = taxable, R/T = either. This model-derived hint is not connected to an account and is not tax advice.">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Account hint</div>
            <div className="mt-0.5 break-words font-bold text-cyan-200">{row.best.account.flag}</div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/30 to-slate-950/80 p-3.5 text-xs">
          <div className="flex items-start justify-between gap-3 border-b border-emerald-900/30 pb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/70">Best qualifying cash-secured put</div>
              <div className="mt-1 font-mono text-xl font-extrabold leading-none text-white">${row.best.contract.strike.toFixed(2)} <span className="text-[10px] font-medium text-slate-400">strike</span></div>
              <div className="mt-1.5 text-[10px] text-slate-400">Expires {row.best.contract.expiration} · {row.best.dte} DTE</div>
            </div>
            <div className="shrink-0 rounded-lg border border-slate-700/80 bg-slate-950/80 px-2.5 py-1.5 text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Put delta</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-slate-200">{delta}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px]">
            <Metric label="Credit / share" value={cash(row.best.credit)} tone="text-emerald-300" />
            <Metric label="Annualized ROC" value={pct(row.best.annRoc)} title="Simple premium-to-cash calculation; not a forecast." />
            <Metric label="OTM proxy" value={pct(row.best.probOtm)} title="Delta-derived proxy, not a measured win rate." />
            <Metric label="Cash secured / contract" value={cash(row.best.cash)} title="Per contract; not account buying power." />
          </div>
          <p className="border-t border-slate-800/80 pt-2 text-[10px] leading-relaxed text-slate-500">Annualized ROC is simple premium-to-cash math, not a forecast; OTM is a delta-derived proxy, not a measured win rate.</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-800 pb-3 text-[10px] text-slate-500">
          <span>Breakeven <b className="font-mono text-slate-300">{cash(row.best.breakeven)}</b> · Cushion <b className="font-mono text-slate-300">{pct(row.best.breakevenCushion)}</b></span>
          <span>{row.count} qualifying contract{row.count === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px]">
          <span className="max-w-full break-words rounded-full border border-slate-800 bg-slate-950 px-2 py-1 text-slate-400">{row.source ?? "Provider source unavailable"}</span>
          {row.stale
            ? <span title="This scan is older than the expected freshness window." className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-200">Stale scan</span>
            : <span title="This scan is within the expected freshness window." className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">Fresh scan</span>}
          <span className="text-slate-500">Scanned {timestamp(row.scannedAt)}</span>
        </div>
        {row.fallbackReason && <p className="mt-2 break-words text-[10px] leading-relaxed text-amber-200/80">Fallback context: {row.fallbackReason}</p>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
        <button type="button" onClick={() => onOpenDetail(ticker)} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/10">Detail workspace</button>
        <button type="button" disabled={chainLoading} onClick={() => onLoadChain(ticker)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:text-white disabled:cursor-wait disabled:opacity-60">{chainLoading ? "Loading chain…" : "Chain snapshot"}</button>
      </div>
    </article>
  );
}

export function WheelCandidateResults({
  results,
  loading,
  viewMode,
  setViewMode,
  chainTicker,
  onOpenDetail,
  onLoadChain,
}: {
  results: LiveWheelResults | null;
  loading: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  chainTicker: string | null;
  onOpenDetail: (ticker: string) => void;
  onLoadChain: (ticker: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-bold text-white">Cash-secured put candidates</h3>
          <p className="mt-1 text-[10px] text-slate-500">Best qualifying contract per ticker · higher score ranks ahead when score sorting is selected (not a win probability).</p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-mono text-slate-400">{results?.rows.length ?? 0} candidates</span>
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1" role="group" aria-label="Candidate display mode">
            <button
              type="button"
              aria-label="Cards view"
              aria-pressed={viewMode === "cards"}
              title="Cards view"
              onClick={() => setViewMode("cards")}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${viewMode === "cards" ? "bg-emerald-500/15 text-emerald-200" : "text-slate-500 hover:text-slate-200"}`}
            >
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
              title="Table view"
              onClick={() => setViewMode("table")}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${viewMode === "table" ? "bg-emerald-500/15 text-emerald-200" : "text-slate-500 hover:text-slate-200"}`}
            >
              <List aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <details className="border-b border-slate-800 bg-slate-950/20">
        <summary className="flex cursor-pointer items-start gap-2 px-4 py-2.5 text-xs text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 sm:items-center">
          <CircleHelp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
          <span className="font-semibold">How to read this card</span>
          <span className="ml-auto hidden text-right text-[10px] text-slate-500 md:block">Higher score ranks ahead · higher IV Rank can mean richer premiums and more risk</span>
        </summary>
        <div className="grid gap-3 border-t border-slate-800 bg-slate-950/40 px-4 py-3 text-[11px] leading-relaxed text-slate-400 sm:grid-cols-2 xl:grid-cols-3">
          <p><strong className="text-slate-200">Wheel Score.</strong> Higher scores rank ahead when score sorting is selected (the default). It combines annualized ROC, delta/OTM, liquidity, and structure factors; it is not a chance of profit, and IV Rank is not scored directly.</p>
          <p><strong className="text-slate-200">IV Rank.</strong> Relative to this ticker&apos;s stored IV observations, higher readings can mean richer option premiums and greater expected movement/risk. A 0% rank is a low relative reading, not zero volatility; stale scans may show old values.</p>
          <p><strong className="text-slate-200">Delta, OTM proxy &amp; DTE.</strong> Put delta is negative. The proxy is 1 − |delta|; a higher proxy generally means farther out of the money, not a measured win rate. DTE is days to expiry; neither longer nor shorter is always better.</p>
          <p><strong className="text-slate-200">Credit &amp; annualized ROC.</strong> Credit is estimated from bid + 25% of the bid/ask spread. ROC = credit ÷ (strike − credit), annualized by 365 ÷ DTE. Higher is a larger modeled return, not a forecast, and may come with more risk; costs are excluded.</p>
          <p><strong className="text-slate-200">Collateral, breakeven &amp; cushion.</strong> Cash secured is strike × 100 per standard contract; lower means less collateral, not automatically a better trade. Breakeven is strike − estimated credit. Cushion is the underlying&apos;s distance above breakeven at scan time—not a loss limit.</p>
          <p><strong className="text-slate-200">Quality &amp; account hint.</strong> A higher quality grade indicates a stronger rules-based stock assessment, not a better option. R = retirement, T = taxable, R/T = either—a general heuristic, not account-specific or tax advice.</p>
          <p><strong className="text-slate-200">Count &amp; freshness.</strong> Qualifying contracts passed the active filters; it is not a trade count. Source and scan time show provenance; “Stale scan” means the displayed market data may need refreshing.</p>
        </div>
      </details>

      {loading && !results ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading provider-backed scan results…</div>
      ) : !results || results.rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">No contracts pass the current filters yet. Hydrate stock data, scan fresh chains, or widen the filter settings.</div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 gap-5 p-4 md:grid-cols-2 lg:grid-cols-3">
          {results.rows.map((row) => <CandidateCard key={row.g.row.ticker} row={row} ivRank={results.ivRanks?.[row.g.row.ticker]} chainLoading={chainTicker === row.g.row.ticker} onOpenDetail={onOpenDetail} onLoadChain={onLoadChain} />)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] w-full text-left text-xs">
            <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>{["Stock", "Quote", "Grade", "Put strike", "DTE / delta", "Credit", "Ann. ROC", "OTM proxy", "IV rank", "Cash secured", "Breakeven", "Account hint", "Data source"].map((header) => <th key={header} className="px-3 py-3 font-semibold">{header}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {results.rows.map((row) => (
                <tr key={row.g.row.ticker} className="hover:bg-slate-800/40">
                  <td className="px-3 py-3"><button onClick={() => onOpenDetail(row.g.row.ticker)} className="font-mono font-bold text-white hover:text-emerald-300" aria-label={`Open ${row.g.row.ticker} detail workspace`}>{row.g.row.ticker}</button><div className="max-w-36 truncate text-[10px] text-slate-500">{row.g.row.name ?? row.g.row.sector ?? ""}</div></td>
                  <td className="px-3 py-3 font-mono text-slate-300">{cash(row.ctx.price)}<div className="text-[9px] text-slate-500">{row.ctx.nextEarnings ? `Earnings ${row.ctx.nextEarnings}` : "Earnings unknown"}</div></td>
                  <td className="px-3 py-3"><span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-bold text-emerald-300">{row.g.grade ?? "N/A"}</span></td>
                  <td className="px-3 py-3 font-mono text-slate-200">${row.best.contract.strike.toFixed(2)}<div className="text-[9px] text-slate-500">{row.best.contract.expiration}</div></td>
                  <td className="px-3 py-3 font-mono text-slate-300">{row.best.dte}d<div className="text-[9px] text-slate-500">Δ {row.best.contract.delta == null ? "N/A" : row.best.contract.delta.toFixed(2)}</div></td>
                  <td className="px-3 py-3 font-mono text-emerald-300">{cash(row.best.credit)}</td>
                  <td className="px-3 py-3 font-mono text-slate-200">{pct(row.best.annRoc)}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{pct(row.best.probOtm)}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{results.ivRanks?.[row.g.row.ticker] == null ? "N/A" : `${results.ivRanks[row.g.row.ticker]}%`}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{cash(row.best.cash)}</td>
                  <td className="px-3 py-3 font-mono text-slate-300">{cash(row.best.breakeven)}<div className="text-[9px] text-slate-500">{pct(row.best.breakevenCushion)} cushion</div></td>
                  <td className="px-3 py-3"><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[9px] text-cyan-200">{row.best.account.flag}</span></td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1"><button onClick={() => onOpenDetail(row.g.row.ticker)} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[10px] text-emerald-200 hover:bg-emerald-500/10">Detail workspace</button><button onClick={() => onLoadChain(row.g.row.ticker)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-300 hover:text-white">{chainTicker === row.g.row.ticker ? "Loading…" : "Chain snapshot"}</button></div><div className="mt-1 text-[9px] text-slate-500">{row.source ?? "Provider"} · {timestamp(row.scannedAt)}</div>{row.stale && <div className="mt-1 text-[9px] text-amber-300">Stale scan</div>}{row.fallbackReason && <div className="mt-1 max-w-48 text-[9px] leading-relaxed text-amber-200/70">Fallback: {row.fallbackReason}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results?.info.failed.length ? <div className="border-t border-slate-800 px-4 py-3 text-[10px] text-amber-300">Unavailable scans: {results.info.failed.slice(0, 5).map((item) => `${item.ticker} (${item.error})`).join(" · ")}</div> : null}
    </section>
  );
}
