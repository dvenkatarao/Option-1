"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Calculator,
  CircleHelp,
  Database,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_PARAMS,
  daysBetween,
  scanCalls,
  type OptionContract,
  type StockCtx,
} from "../../lib/wheel";
import type { LiveWheelResults } from "../live/wheel-types";

type CallChainResponse = {
  symbol: string;
  price: number;
  source: string;
  fetchedAt: string | null;
  stale: boolean;
  fallbackReasons: string[];
  contracts: OptionContract[];
};

type CallChainState =
  | { ticker: string; snapshot: CallChainResponse }
  | { ticker: string; error: string };

type ScenarioOverrides = {
  contracts?: number;
  putStrike?: number;
  putCredit?: number;
  callSymbol?: string | undefined;
  callCredit?: number | undefined;
  dividendPerShare?: number;
};

type ScenarioTab = "flow" | "payoff" | "summary";

const cash = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "N/A"
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const fractionPct = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value)
    ? "N/A"
    : `${(value * 100).toFixed(digits)}%`;
const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";
const dateLabel = (value: string | null | undefined) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString()
  : "Not reported";
const todayIso = () => new Date().toISOString().slice(0, 10);

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Provider request failed (${response.status})`);
  }
  return body as T;
}

function Metric({ label, value, hint, tone = "text-slate-100" }: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/80 p-3" title={hint}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 break-words font-mono text-sm font-bold ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-[10px] leading-relaxed text-slate-500">{hint}</div>}
    </div>
  );
}

function SourceBadge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "emerald" | "amber" }) {
  const classes = tone === "emerald"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
    : tone === "amber"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
      : "border-slate-800 bg-slate-950 text-slate-400";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] ${classes}`}>{children}</span>;
}

export function WheelSimulatorView({
  results,
  resultsLoading,
  initialTicker = null,
  onOpenLiveScanner,
}: {
  results: LiveWheelResults | null;
  resultsLoading: boolean;
  initialTicker?: string | null;
  onOpenLiveScanner: () => void;
}) {
  const rows = results?.rows ?? [];
  const [selectedTicker, setSelectedTicker] = useState(initialTicker ?? "");
  const [scenarios, setScenarios] = useState<Record<string, ScenarioOverrides>>({});
  const [activeTab, setActiveTab] = useState<ScenarioTab>("flow");
  const [callChainState, setCallChainState] = useState<CallChainState | null>(null);
  const [callChainReload, setCallChainReload] = useState(0);

  const selectedRow = selectedTicker
    ? rows.find((row) => row.g.row.ticker === selectedTicker) ?? null
    : rows[0] ?? null;
  const ticker = selectedRow?.g.row.ticker ?? null;
  const scenario = ticker ? scenarios[ticker] ?? {} : {};
  const contracts = scenario.contracts ?? 1;
  const putStrike = scenario.putStrike ?? selectedRow?.best.contract.strike ?? 0;
  const putCredit = scenario.putCredit ?? selectedRow?.best.credit ?? 0;
  const dividendPerShare = scenario.dividendPerShare ?? 0;
  const putDte = selectedRow ? daysBetween(todayIso(), selectedRow.best.contract.expiration) : 0;
  const validPutScenario = Boolean(
    selectedRow && putStrike > 0 && putCredit >= 0 && putStrike > putCredit && putDte > 0,
  );

  const updateScenario = (patch: Partial<ScenarioOverrides>) => {
    if (!ticker) return;
    setScenarios((current) => ({
      ...current,
      [ticker]: { ...current[ticker], ...patch },
    }));
  };

  const candidateTicker = selectedRow?.g.row.ticker ?? null;
  useEffect(() => {
    if (!candidateTicker) return;
    const controller = new AbortController();
    void readJson<CallChainResponse>(
      `/api/wheel/chain?symbol=${encodeURIComponent(candidateTicker)}&type=call&dteMin=7&dteMax=70`,
      controller.signal,
    ).then((snapshot) => {
      if (!controller.signal.aborted) setCallChainState({ ticker: candidateTicker, snapshot });
    }).catch((reason) => {
      if (!controller.signal.aborted) {
        setCallChainState({
          ticker: candidateTicker,
          error: reason instanceof Error ? reason.message : "Live call chain is unavailable",
        });
      }
    });
    return () => controller.abort();
  }, [candidateTicker, callChainReload]);

  const currentChainState = ticker && callChainState?.ticker === ticker ? callChainState : null;
  const callChain = currentChainState && "snapshot" in currentChainState ? currentChainState.snapshot : null;
  const callChainLoading = Boolean(ticker && currentChainState === null);
  const stockContext = useMemo<StockCtx | null>(() => {
    if (!selectedRow) return null;
    return {
      ticker: selectedRow.g.row.ticker,
      price: callChain?.price ?? selectedRow.ctx.price,
      nextEarnings: selectedRow.ctx.nextEarnings,
      earningsEstimated: selectedRow.ctx.earningsEstimated,
      exDividend: selectedRow.ctx.exDividend,
      dividendPerShare: selectedRow.ctx.dividendPerShare,
      dividendYield: selectedRow.ctx.dividendYield,
      beta: selectedRow.ctx.beta,
      hv30: selectedRow.ctx.hv30,
      sma200: selectedRow.ctx.sma200,
      supports: selectedRow.ctx.supports,
    };
  }, [selectedRow, callChain?.price]);

  const callScan = useMemo(() => {
    if (!callChain || !stockContext || !validPutScenario) return null;
    return scanCalls(callChain.contracts, stockContext, putStrike - putCredit, DEFAULT_PARAMS, todayIso());
  }, [callChain, stockContext, validPutScenario, putStrike, putCredit]);
  const callCandidates = callScan?.candidates ?? [];
  const selectedCall = callCandidates.find((candidate) => candidate.contract.symbol === scenario.callSymbol)
    ?? callCandidates[0]
    ?? null;
  const callStrike = selectedCall?.contract.strike ?? null;
  const hasManualCallCredit = Boolean(selectedCall && scenario.callSymbol === selectedCall.contract.symbol && scenario.callCredit != null);
  const callCredit = selectedCall
    ? hasManualCallCredit ? scenario.callCredit ?? selectedCall.credit : selectedCall.credit
    : null;
  const callDte = selectedCall?.dte ?? null;
  const validCycle = Boolean(
    validPutScenario && selectedCall && callStrike != null && callCredit != null && callDte != null && callDte > 0,
  );

  const shares = contracts * 100;
  const putCollateral = validPutScenario ? putStrike * shares : null;
  const putIncome = validPutScenario ? putCredit * shares : null;
  const putBreakEven = validPutScenario ? putStrike - putCredit : null;
  const putAnnualRoc = validPutScenario
    ? (putCredit / (putStrike - putCredit)) * (365 / putDte) * 100
    : null;
  const putOtm = validPutScenario && selectedRow?.ctx.price
    ? ((selectedRow.ctx.price - putStrike) / selectedRow.ctx.price) * 100
    : null;
  const callIncome = validCycle ? (callCredit as number) * shares : null;
  const dividendIncome = validCycle ? dividendPerShare * shares : null;
  const basisAfterPut = putBreakEven;
  const basisAfterCall = validCycle && basisAfterPut != null
    ? basisAfterPut - (callCredit as number) - dividendPerShare
    : null;
  const capitalGainIfCalled = validCycle && callStrike != null
    ? (callStrike - putStrike) * shares
    : null;
  const totalProfitIfCalled = validCycle && putIncome != null && callIncome != null && dividendIncome != null && capitalGainIfCalled != null
    ? putIncome + callIncome + dividendIncome + capitalGainIfCalled
    : null;
  const totalRoiIfCalled = validCycle && totalProfitIfCalled != null && putCollateral != null && putCollateral > 0
    ? (totalProfitIfCalled / putCollateral) * 100
    : null;
  const annualizedIfCalled = validCycle && totalRoiIfCalled != null && callDte != null
    ? totalRoiIfCalled * (365 / (putDte + callDte))
    : null;

  const payoffData = useMemo(() => {
    if (!validCycle || !selectedRow || callStrike == null || callCredit == null) return [];
    const spot = callChain?.price ?? selectedRow.ctx.price;
    const range = Math.max(1, spot * 0.25);
    const min = Math.max(0, Math.floor(Math.min(putStrike, spot) - range));
    const max = Math.ceil(Math.max(callStrike, spot) + range);
    const step = Math.max(0.5, (max - min) / 40);
    const points: { underlying: number; pnl: number }[] = [];
    for (let underlying = min; underlying <= max + step / 2; underlying += step) {
      const proceedsPerShare = Math.min(underlying, callStrike) - putStrike + putCredit + callCredit + dividendPerShare;
      points.push({ underlying: Number(underlying.toFixed(2)), pnl: Math.round(proceedsPerShare * shares) });
    }
    return points;
  }, [validCycle, selectedRow, callChain?.price, callStrike, callCredit, putStrike, putCredit, dividendPerShare, shares]);

  const resetToLiveCandidate = () => {
    if (!ticker) return;
    setScenarios((current) => {
      const next = { ...current };
      delete next[ticker];
      return next;
    });
  };

  const selectedTickerUnavailable = Boolean(selectedTicker && rows.length > 0 && !selectedRow);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RotateCw className="h-6 w-6 shrink-0 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white">Interactive Wheel Cycle Simulator</h1>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">
            Starts with a put candidate from Live Provider Scanner and a covered call selected from the provider chain; source and freshness are shown below. Scenario results are arithmetic, not forecasts or broker fills.
          </p>
        </div>
        {rows.length > 0 && (
          <label className="min-w-0 text-xs text-slate-400 lg:w-[min(100%,32rem)]">
            Live scanner candidate
            <select
              value={selectedRow?.g.row.ticker ?? ""}
              onChange={(event) => setSelectedTicker(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
            >
              {!selectedRow && <option value="">Choose a live scanner result…</option>}
              {rows.map((row) => (
                <option key={row.g.row.ticker} value={row.g.row.ticker}>
                  {row.g.row.ticker} — {row.g.row.name ?? "Provider-backed stock"} · {cash(row.ctx.price)} · put {cash(row.best.contract.strike)} {row.best.contract.expiration}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {!results && (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {resultsLoading ? <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-300" /> : <Database className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />}
            <div>
              <h2 className="text-sm font-bold text-white">{resultsLoading ? "Loading live scanner candidates" : "No live scanner results loaded"}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{resultsLoading ? "Waiting for Live Provider Scanner & Journal to finish loading provider-backed candidates." : "Open Live Provider Scanner & Journal and load or scan provider-backed candidates. This simulator does not substitute bundled sample stocks or option prices."}</p>
            </div>
          </div>
          <button type="button" onClick={onOpenLiveScanner} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500">Open Live Provider Scanner</button>
        </section>
      )}

      {results && rows.length === 0 && (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <h2 className="text-sm font-bold text-white">No qualifying live put candidates</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">The current Live Provider Scanner filters returned no candidates. Adjust the scanner filters, hydrate stock data, or scan fresh chains; sample data is not used as a fallback.</p>
            </div>
          </div>
          <button type="button" onClick={onOpenLiveScanner} className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">Review scanner</button>
        </section>
      )}

      {selectedTickerUnavailable && (
        <div role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100/80">
          {selectedTicker} is not in the current Live Provider Scanner results. Choose one of the live candidates below; sample values are never substituted.
        </div>
      )}

      {selectedRow && ticker && (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <SourceBadge>{selectedRow.source ?? "Option source unavailable"}</SourceBadge>
              {selectedRow.stale
                ? <SourceBadge tone="amber">Stale put scan</SourceBadge>
                : <SourceBadge tone="emerald">Fresh put scan</SourceBadge>}
              <span className="text-slate-500">Put scan {stamp(selectedRow.scannedAt)}</span>
              <span className="text-slate-500">Underlying at scan {cash(selectedRow.ctx.price)}</span>
            </div>
            {selectedRow.fallbackReason && <p className="mt-2 break-words text-[10px] leading-relaxed text-amber-200/80">Fallback context: {selectedRow.fallbackReason}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="Company" value={selectedRow.g.row.name ?? "Name unavailable"} />
              <Metric label="Quality grade" value={selectedRow.g.grade ?? "N/A"} />
              <Metric label="Wheel score" value={`${Number.isFinite(selectedRow.best.score) ? selectedRow.best.score.toFixed(0) : "N/A"}/100`} hint="Ranking heuristic, not probability of profit." />
              <Metric label="IV rank" value={results?.ivRanks[selectedRow.g.row.ticker] == null ? "N/A" : `${results.ivRanks[selectedRow.g.row.ticker]}%`} />
              <Metric label="Put OTM cushion" value={fractionPct(putOtm != null ? putOtm / 100 : null)} />
              <Metric label="Qualifying puts" value={String(selectedRow.count)} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-emerald-300" /><h2 className="text-sm font-bold text-white">Live quote inputs &amp; scenario controls</h2></div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Put values start from the scanner&apos;s best qualifying contract. Credit estimates use bid + 25% of the spread; edits below are scenario overrides, not provider quotes.</p>
              </div>
              <button type="button" onClick={resetToLiveCandidate} className="self-start rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-semibold text-slate-300 hover:text-white sm:self-auto">Reset to live candidate</button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs md:grid-cols-3 xl:grid-cols-6">
              <label className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[10px] text-slate-400">Contracts
                <input type="number" min="1" max="20" step="1" value={contracts} onChange={(event) => updateScenario({ contracts: Math.min(20, Math.max(1, Math.floor(Number(event.target.value) || 1)))})} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-center font-mono text-sm font-bold text-white outline-none focus:border-emerald-500" />
                <span className="mt-1 block text-center text-[10px] text-slate-500">{shares} shares</span>
              </label>
              <label className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[10px] text-slate-400">Put strike / share
                <input type="number" min="0.01" step="0.01" value={putStrike || ""} onChange={(event) => updateScenario({ putStrike: Number(event.target.value) || 0, callSymbol: undefined, callCredit: undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-center font-mono text-sm font-bold text-emerald-300 outline-none focus:border-emerald-500" />
                <span className="mt-1 block text-center text-[10px] text-slate-500">Live put expiry {dateLabel(selectedRow.best.contract.expiration)}</span>
              </label>
              <label className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[10px] text-slate-400">Put credit / share
                <input type="number" min="0" step="0.01" value={putCredit} onChange={(event) => updateScenario({ putCredit: Number(event.target.value) || 0, callSymbol: undefined, callCredit: undefined })} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-center font-mono text-sm font-bold text-emerald-300 outline-none focus:border-emerald-500" />
                <span className="mt-1 block text-center text-[10px] text-slate-500">Scan fill estimate · {putDte} DTE</span>
              </label>
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[10px] text-slate-400">Put bid / ask
                <div className="mt-2 text-center font-mono text-sm font-bold text-white">{cash(selectedRow.best.contract.bid)} / {cash(selectedRow.best.contract.ask)}</div>
                <span className="mt-1 block text-center text-[10px] text-slate-500">{selectedRow.best.contract.delta == null ? "Delta N/A" : `Delta ${selectedRow.best.contract.delta.toFixed(2)}`}</span>
              </div>
              <label className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[10px] text-slate-400">Call credit / share
                <input type="number" min="0" step="0.01" disabled={!selectedCall} value={selectedCall ? callCredit ?? "" : ""} onChange={(event) => updateScenario({ callSymbol: selectedCall?.contract.symbol, callCredit: Number(event.target.value) || 0 })} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-center font-mono text-sm font-bold text-cyan-300 outline-none focus:border-cyan-500 disabled:opacity-50" />
                <span className="mt-1 block text-center text-[10px] text-slate-500">{hasManualCallCredit ? "Manual scenario override" : "Provider estimate · edits are assumptions"}</span>
              </label>
              <label className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[10px] text-slate-400">Dividend / share in scenario
                <input type="number" min="0" step="0.01" value={dividendPerShare} onChange={(event) => updateScenario({ dividendPerShare: Number(event.target.value) || 0 })} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-center font-mono text-sm font-bold text-cyan-300 outline-none focus:border-cyan-500" />
                <span className="mt-1 block text-center text-[10px] text-slate-500">Manual assumption; defaults to $0</span>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <span>Reported annual dividend/share: {cash(selectedRow.ctx.dividendPerShare)} · yield {fractionPct(selectedRow.ctx.dividendYield)} · last reported ex-date {dateLabel(selectedRow.ctx.exDividend)}.</span>
              <span className="text-amber-200/80">Stored annual rate and last ex-date are context, not a forecast; dividend income is excluded unless entered above.</span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-bold text-white">Provider-backed covered-call contract</h2></div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Call candidates are fetched for {ticker} and checked against current price, net basis, liquidity, DTE, delta, spread, return, and earnings rules.</p>
              </div>
              <button type="button" disabled={callChainLoading} onClick={() => { setCallChainState(null); setCallChainReload((current) => current + 1); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${callChainLoading ? "animate-spin" : ""}`} />Reload call chain</button>
            </div>

            {callChainLoading && <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-400">Loading current provider call quotes for {ticker}…</div>}
            {currentChainState && "error" in currentChainState && <div role="alert" className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-100/80">Live call chain unavailable: {currentChainState.error}. No example call strike or premium is substituted.</div>}
            {callChain && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <SourceBadge>{callChain.source || "Call source unavailable"}</SourceBadge>
                  {callChain.stale ? <SourceBadge tone="amber">Stale call chain</SourceBadge> : <SourceBadge tone="emerald">Call chain refreshed</SourceBadge>}
                  <span className="text-slate-500">Underlying {cash(callChain.price)} · fetched {stamp(callChain.fetchedAt)} · {callChain.contracts.length} quoted contracts</span>
                  {callChain.fallbackReasons.map((reason) => <span key={reason} className="text-amber-200/80">Fallback: {reason}</span>)}
                </div>
                {callCandidates.length > 0 ? (
                  <label className="block max-w-3xl text-xs text-slate-400">Qualified live call candidate
                    <select value={selectedCall?.contract.symbol ?? ""} onChange={(event) => updateScenario({ callSymbol: event.target.value, callCredit: undefined })} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-500">
                      {callCandidates.map((candidate) => <option key={candidate.contract.symbol} value={candidate.contract.symbol}>{candidate.contract.expiration} · ${candidate.contract.strike.toFixed(2)} call · {candidate.dte} DTE · est. credit {cash(candidate.credit)} · Δ {candidate.contract.delta?.toFixed(2) ?? "N/A"}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-400">{callScan ? "No calls pass the current provider-backed liquidity, DTE, delta, spread, earnings, and return rules at this cost basis." : "Call candidates are unavailable until the live quote and put scenario inputs are valid."} No sample contracts are used.</div>
                )}
                {selectedCall && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="Selected call" value={`$${selectedCall.contract.strike.toFixed(2)} · ${selectedCall.contract.expiration}`} />
                    <Metric label="DTE / delta" value={`${selectedCall.dte} DTE · ${selectedCall.contract.delta?.toFixed(2) ?? "N/A"}`} />
                    <Metric label="Estimated credit" value={cash(selectedCall.credit)} tone="text-cyan-300" hint="Bid + 25% of spread; not an executed fill." />
                    <Metric label="Early assignment" value={selectedCall.earlyAssignmentRisk ?? "None identified"} tone={selectedCall.earlyAssignmentRisk ? "text-amber-200" : "text-emerald-300"} />
                  </div>
                )}
              </div>
            )}
          </section>

          {!validPutScenario && <div role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100/80">{putDte <= 0 ? "The selected provider put has expired; scan fresh chains before modeling this candidate." : "The current put scenario needs a positive strike above its credit before outcomes can be calculated."}</div>}

          <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-2" role="tablist" aria-label="Wheel scenario views">
            {([ ["flow", "Wheel lifecycle"], ["payoff", "Payoff profile"], ["summary", "Cycle summary"] ] as const).map(([tab, label]) => (
              <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-medium transition ${activeTab === tab ? "bg-emerald-600 font-semibold text-slate-950 shadow-md shadow-emerald-600/30" : "bg-slate-900 text-slate-400 hover:text-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === "flow" && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4 shadow-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Phase 1 · Cash-secured put</div>
                  <h3 className="mt-1 text-sm font-bold text-white">Sell the selected live put</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Candidate: {ticker} · ${putStrike.toFixed(2)} strike · {dateLabel(selectedRow.best.contract.expiration)}.</p>
                  <div className="mt-3 space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Cash collateral</span><b className="font-mono text-slate-100">{cash(putCollateral)}</b></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Estimated credit</span><b className="font-mono text-emerald-300">{cash(putIncome)}</b></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Simple annualized ROC</span><b className="font-mono text-emerald-300">{fractionPct(putAnnualRoc != null ? putAnnualRoc / 100 : null)}</b></div>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Phase 2 · If assigned</div>
                  <h3 className="mt-1 text-sm font-bold text-white">Cost basis after put credit</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Assignment is a scenario, not a prediction; actual fills and price paths can differ.</p>
                  <div className="mt-3 space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Shares</span><b className="font-mono text-slate-100">{shares}</b></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Put strike</span><b className="font-mono text-slate-100">{cash(putStrike)}</b></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Net basis / share</span><b className="font-mono text-cyan-200">{cash(basisAfterPut)}</b></div>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Phase 3 · Covered call</div>
                  <h3 className="mt-1 text-sm font-bold text-white">Select a live call quote</h3>
                  {selectedCall ? (
                    <>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{dateLabel(selectedCall.contract.expiration)} · ${selectedCall.contract.strike.toFixed(2)} strike · {selectedCall.dte} DTE.</p>
                      <div className="mt-3 space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
                        <div className="flex justify-between gap-2"><span className="text-slate-400">Estimated call credit</span><b className="font-mono text-cyan-300">{cash(callIncome)}</b></div>
                        <div className="flex justify-between gap-2"><span className="text-slate-400">Break-even after credit</span><b className="font-mono text-emerald-200">{cash(basisAfterCall)}</b></div>
                        <div className="flex justify-between gap-2"><span className="text-slate-400">Call source</span><b className="font-mono text-slate-300">{callChain?.source ?? "N/A"}</b></div>
                      </div>
                    </>
                  ) : <p className="mt-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-400">Choose a qualifying call from the provider chain to calculate the covered-call phase.</p>}
                </article>

                <article className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 to-slate-900 p-4 shadow-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Phase 4 · Scenario outcome</div>
                  <h3 className="mt-1 text-sm font-bold text-white">If shares are called away</h3>
                  {validCycle ? (
                    <div className="mt-3 space-y-1.5 rounded-xl border border-emerald-800/40 bg-slate-950/70 p-3 text-xs">
                      <div className="flex justify-between gap-2"><span className="text-slate-400">Net profit / loss</span><b className="font-mono text-emerald-300">{cash(totalProfitIfCalled)}</b></div>
                      <div className="flex justify-between gap-2"><span className="text-slate-400">Return on put collateral</span><b className="font-mono text-emerald-300">{fractionPct(totalRoiIfCalled != null ? totalRoiIfCalled / 100 : null)}</b></div>
                      <div className="flex justify-between gap-2"><span className="text-slate-400">Simple annualized scenario</span><b className="font-mono text-emerald-300">{fractionPct(annualizedIfCalled != null ? annualizedIfCalled / 100 : null)}</b></div>
                    </div>
                  ) : <p className="mt-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-400">A complete-cycle result appears after a live call candidate is selected.</p>}
                </article>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-amber-100/70"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />The put/call credit values use a partial-spread fill estimate and are not broker fills. Annualization is simple scenario math, not a forecast. Dividend income is excluded unless you enter a verified amount for this scenario. Fees, taxes, slippage, early assignment and market moves can change outcomes.</div>
            </div>
          )}

          {activeTab === "payoff" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-sm font-bold text-white">Scenario payoff at call expiration</h2>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Assumes the put is assigned, then the selected covered call is held to expiration. Uses the live call contract plus your scenario overrides.</p>
                </div>
                {validCycle && <div className="flex gap-4 text-xs font-mono"><span className="text-emerald-300">If called: {cash(totalProfitIfCalled)}</span><span className="text-cyan-200">Basis after credits: {cash(basisAfterCall)}</span></div>}
              </div>
              {validCycle && payoffData.length > 0 ? (
                <div className="mt-4 h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={120} minHeight={220}>
                    <LineChart data={payoffData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="underlying" stroke="#64748b" tickFormatter={(value) => `$${Number(value).toFixed(0)}`} tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tickFormatter={(value) => `$${Number(value).toLocaleString()}`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value) => [cash(typeof value === "number" ? value : Number(value)), "Scenario P/L"]} labelFormatter={(value) => `Underlying at call expiry: ${cash(Number(value))}`} contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 8, color: "#f8fafc", fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                      <ReferenceLine x={putStrike} stroke="#10b981" label={{ value: "Put strike", fill: "#10b981", fontSize: 10 }} />
                      {callStrike != null && <ReferenceLine x={callStrike} stroke="#06b6d4" label={{ value: "Call strike", fill: "#06b6d4", fontSize: 10 }} />}
                      <Line type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={3} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="mt-4 grid h-52 place-items-center rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">Select a live provider call candidate to calculate a payoff profile.</div>}
            </section>
          )}

          {activeTab === "summary" && (
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
              <div className="border-b border-slate-800 p-4"><h2 className="text-sm font-bold text-white">Current live cycle summary</h2><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Only selected provider-backed option quotes and explicit scenario inputs are included. Future roll premiums are not extrapolated.</p></div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-xs">
                  <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Step", "Contract / assumption", "Timing", "Cash flow / basis"].map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-800/80">
                    <tr><td className="px-4 py-3 font-semibold text-white">Cash-secured put</td><td className="px-4 py-3 font-mono text-slate-300">{ticker} ${putStrike.toFixed(2)} put · {cash(putCredit)} credit/share</td><td className="px-4 py-3 text-slate-400">{dateLabel(selectedRow.best.contract.expiration)} · {putDte} DTE</td><td className="px-4 py-3 font-mono text-emerald-300">Collateral {cash(putCollateral)} · credit {cash(putIncome)}</td></tr>
                    <tr><td className="px-4 py-3 font-semibold text-white">If assigned</td><td className="px-4 py-3 text-slate-300">{shares} shares of {ticker}</td><td className="px-4 py-3 text-slate-400">Scenario</td><td className="px-4 py-3 font-mono text-cyan-200">Net basis {cash(basisAfterPut)}/share</td></tr>
                    <tr><td className="px-4 py-3 font-semibold text-white">Covered call</td><td className="px-4 py-3 font-mono text-slate-300">{selectedCall ? `${ticker} $${selectedCall.contract.strike.toFixed(2)} call · ${cash(callCredit)} credit/share` : "Select a live call candidate"}</td><td className="px-4 py-3 text-slate-400">{selectedCall ? `${dateLabel(selectedCall.contract.expiration)} · ${selectedCall.dte} DTE` : "N/A"}</td><td className="px-4 py-3 font-mono text-cyan-200">{callIncome == null ? "N/A" : `Credit ${cash(callIncome)}`}</td></tr>
                    <tr><td className="px-4 py-3 font-semibold text-white">If called away</td><td className="px-4 py-3 text-slate-300">{selectedCall ? `Sell ${shares} shares at ${cash(selectedCall.contract.strike)}` : "No call outcome calculated"}</td><td className="px-4 py-3 text-slate-400">{selectedCall ? `${putDte + selectedCall.dte} total option days` : "N/A"}</td><td className="px-4 py-3 font-mono text-emerald-300">{totalProfitIfCalled == null ? "N/A" : `Scenario P/L ${cash(totalProfitIfCalled)}`}</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
