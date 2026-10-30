"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Info, RefreshCw, X } from "lucide-react";
import type { OptionContract } from "../../lib/wheel";

type LiveChainSnapshot = {
  symbol: string;
  price: number;
  nextEarnings: string | null;
  source: string;
  fetchedAt: string | null;
  stale: boolean;
  fallbackReasons?: string[];
  contracts: OptionContract[];
};

type ContractSide = "all" | "put" | "call";
const PAGE_SIZE = 24;

const cash = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? "N/A"
  : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? "N/A"
  : `${(value * 100).toFixed(1)}%`;
const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Timestamp unavailable";
const daysToExpiration = (expiration: string) => Math.max(0, Math.round((Date.parse(`${expiration}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000));

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 break-words font-mono text-xs font-semibold text-slate-200">{value}</div>
    </div>
  );
}

export function LiveWheelChainModal({
  ticker,
  chain,
  loading,
  error,
  onClose,
  onRetry,
  onUseContract,
}: {
  ticker: string;
  chain: LiveChainSnapshot | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onUseContract: (contract: OptionContract) => void;
}) {
  const [side, setSide] = useState<ContractSide>("all");
  const [expiration, setExpiration] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const selectedDetailsRef = useRef<HTMLElement | null>(null);

  const selectContract = (contract: OptionContract) => {
    setSelectedSymbol(contract.symbol);
    // On narrow screens the detail panel stacks below the contract cards; bring it into view on selection.
    if (window.innerWidth < 1280) {
      window.setTimeout(() => selectedDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 40);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const expirations = useMemo(
    () => [...new Set(chain?.contracts.map((contract) => contract.expiration) ?? [])].sort(),
    [chain],
  );
  const filteredContracts = useMemo(
    () => (chain?.contracts ?? []).filter((contract) =>
      (side === "all" || contract.type === side) &&
      (expiration === "all" || contract.expiration === expiration),
    ),
    [chain, side, expiration],
  );
  const pageCount = Math.max(1, Math.ceil(filteredContracts.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleContracts = filteredContracts.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const selectedContract = filteredContracts.find((contract) => contract.symbol === selectedSymbol) ?? filteredContracts[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-2 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${ticker} live option chain`}
        className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-lg font-extrabold text-white sm:text-xl">{ticker} option chain</h2>
              {chain?.stale && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">Cached / stale</span>}
              {chain && !chain.stale && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">Provider snapshot</span>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
              <span>Underlying <b className="font-mono text-slate-200">{chain ? cash(chain.price) : "Loading…"}</b></span>
              {chain?.nextEarnings && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3 text-amber-300" />Next earnings {chain.nextEarnings}</span></>}
              {chain?.source && <><span aria-hidden="true">·</span><span>Source {chain.source}</span></>}
              {chain && <><span aria-hidden="true">·</span><span>Fetched {stamp(chain.fetchedAt)}</span></>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close option chain"
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3 sm:px-6">
            <div className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-400">
              <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
              <p>Provider-returned contracts in the scanner&apos;s 7–70 DTE window. Quotes may be delayed and are informational only; this view does not submit orders. Greeks may be provider-supplied or model-derived as labeled.</p>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            {error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-xs text-amber-100">
                <span>{error}</span>
                <button type="button" onClick={onRetry} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 px-3 py-1.5 font-semibold hover:bg-amber-500/10 disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Retry
                </button>
              </div>
            )}

            {loading && !chain && (
              <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin text-cyan-300" />Loading provider option chain…</span>
              </div>
            )}

            {chain && (
              <>
                {chain.fallbackReasons?.length ? (
                  <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-[10px] leading-relaxed text-amber-100/80">
                    Fallback context: {chain.fallbackReasons.join(" · ")}
                  </div>
                ) : null}

                <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:flex-row sm:items-end">
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter option type">
                    {([ ["all", "Calls + puts"], ["put", "Puts"], ["call", "Calls"] ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={side === value}
                        onClick={() => { setSide(value); setPage(0); }}
                        className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${side === value ? "bg-emerald-600 text-slate-950" : "border border-slate-700 bg-slate-950 text-slate-300 hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-44 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Expiration
                      <select
                        value={expiration}
                        onChange={(event) => { setExpiration(event.target.value); setPage(0); }}
                        className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-cyan-400/60"
                      >
                        <option value="all">All expirations ({expirations.length})</option>
                        {expirations.map((date) => <option key={date} value={date}>{date} · {daysToExpiration(date)} DTE</option>)}
                      </select>
                    </label>
                    <span className="pb-2 text-[10px] font-mono text-slate-500">{filteredContracts.length.toLocaleString()} contracts</span>
                  </div>
                </div>

                {filteredContracts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                    {loading ? "Refreshing contracts…" : "No contracts match these filters."}
                  </div>
                ) : (
                  <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
                    <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-slate-200">Provider contracts</h3>
                        <span className="text-[9px] text-slate-500">{filteredContracts.length.toLocaleString()} available · {PAGE_SIZE} per page</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleContracts.map((contract) => {
                          const isSelected = selectedContract?.symbol === contract.symbol;
                          return (
                            <button
                              key={contract.symbol}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => selectContract(contract)}
                              className={`min-w-0 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${isSelected ? "border-cyan-500/50 bg-cyan-500/10" : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase ${contract.type === "put" ? "border-rose-500/20 bg-rose-500/10 text-rose-200" : "border-cyan-500/20 bg-cyan-500/10 text-cyan-200"}`}>{contract.type}</span>
                                <span className="truncate text-[9px] text-slate-500">{contract.expiration} · {daysToExpiration(contract.expiration)} DTE</span>
                              </div>
                              <div className="mt-2 font-mono text-lg font-extrabold text-white">{cash(contract.strike)}</div>
                              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                                <span className="text-slate-500">Bid / ask</span><span className="text-right font-mono text-slate-300">{cash(contract.bid)} / {cash(contract.ask)}</span>
                                <span className="text-slate-500">Delta</span><span className="text-right font-mono text-slate-300">{contract.delta?.toFixed(3) ?? "N/A"}</span>
                                <span className="text-slate-500">IV</span><span className="text-right font-mono text-slate-300">{percent(contract.iv)}</span>
                                <span className="text-slate-500">OI</span><span className="text-right font-mono text-slate-300">{contract.oi?.toLocaleString() ?? "N/A"}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {pageCount > 1 && (
                        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-[10px] text-slate-500">
                          <span>Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filteredContracts.length)} of {filteredContracts.length}</span>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} aria-label="Previous contracts" className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                            <span className="min-w-12 text-center font-mono">{safePage + 1} / {pageCount}</span>
                            <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage + 1 >= pageCount} aria-label="Next contracts" className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      )}
                    </section>

                    <aside ref={selectedDetailsRef} className="scroll-mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4 xl:sticky xl:top-2">
                      {selectedContract ? (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Selected contract</div>
                              <h3 className="mt-1 font-mono text-lg font-extrabold text-white">{cash(selectedContract.strike)} {selectedContract.type}</h3>
                              <p className="mt-0.5 text-[10px] text-slate-400">{selectedContract.expiration} · {daysToExpiration(selectedContract.expiration)} DTE</p>
                            </div>
                            <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-400">{selectedContract.source}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <DetailMetric label="Bid / ask" value={`${cash(selectedContract.bid)} / ${cash(selectedContract.ask)}`} />
                            <DetailMetric label="Last" value={cash(selectedContract.last)} />
                            <DetailMetric label="Delta" value={selectedContract.delta?.toFixed(4) ?? "N/A"} />
                            <DetailMetric label="Implied volatility" value={percent(selectedContract.iv)} />
                            <DetailMetric label="Open interest" value={selectedContract.oi?.toLocaleString() ?? "N/A"} />
                            <DetailMetric label="Volume" value={selectedContract.volume?.toLocaleString() ?? "N/A"} />
                            <DetailMetric label="Gamma" value={selectedContract.gamma?.toFixed(5) ?? "N/A"} />
                            <DetailMetric label="Theta / day" value={selectedContract.theta?.toFixed(5) ?? "N/A"} />
                            <DetailMetric label="Vega" value={selectedContract.vega?.toFixed(5) ?? "N/A"} />
                            <DetailMetric label="Rho" value={selectedContract.rho?.toFixed(5) ?? "N/A"} />
                          </div>
                          <div className="mt-3 space-y-1 text-[10px] leading-relaxed text-slate-500">
                            <p>Greeks: {selectedContract.greeksSource ?? selectedContract.deltaSource ?? "unavailable"}</p>
                            <p>Quote time: {stamp(selectedContract.quoteTimestamp)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onUseContract(selectedContract)}
                            disabled={selectedContract.bid == null && selectedContract.last == null}
                            className="mt-4 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Use contract in journal
                          </button>
                          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Prefills a manual journal entry only. Review the quote and enter your actual fill before saving; no order is submitted.</p>
                        </>
                      ) : (
                        <div className="grid min-h-40 place-items-center text-center text-[10px] text-slate-500">Choose a contract card to review its quote and Greeks.</div>
                      )}
                    </aside>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
