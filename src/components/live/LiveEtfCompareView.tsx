"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calculator, Database, Layers, ShieldAlert, ShieldCheck, TrendingUp, X, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScreenRow } from "../../types/liveScreener";
import type { LiveEtfDetailResponse } from "./LiveEtfDetailModal";
import { LiveEtfDetailModal } from "./LiveEtfDetailModal";

type LiveEtfCompareViewProps = {
  rows: ScreenRow[];
  availableRows: ScreenRow[];
  sourceAsOf: string | null;
  sourceStale: boolean;
  onToggleCompare: (row: ScreenRow) => void;
  onBack: () => void;
};

type Holding = { symbol: string | null; name: string; weight: number | null };
type HoldingDetail = Pick<LiveEtfDetailResponse, "fund">;
type ReturnField = "r1y" | "r3y" | "r5y";

type OverlapResult = {
  percent: number;
  shared: { symbol: string; name: string; weightA: number; weightB: number; sharedWeight: number }[];
  holdingsA: Holding[];
  holdingsB: Holding[];
};

const FUND_COLORS = ["#10b981", "#06b6d4", "#a855f7"];
const pct = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "N/A" : `${(value * 100).toFixed(digits)}%`;
const money = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "N/A" : `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const aum = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return money(value, 0);
};
const dateLabel = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString() : "N/A";
const changeLabel = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "N/A" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const timestampLabel = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";

async function loadCompareDetail(ticker: string, signal: AbortSignal): Promise<HoldingDetail> {
  const response = await fetch(`/api/etfs/${encodeURIComponent(ticker)}`, { cache: "no-store", signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${response.status})`);
  return data as HoldingDetail;
}

function Section({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl ${className}`}>
      {title && <h3 className="text-base font-bold text-white">{title}</h3>}
      {children}
    </section>
  );
}

function ErosionValue({ row }: { row: ScreenRow }) {
  const positive = row.erosion === "None" || row.erosion === "Mild";
  const moderate = row.erosion === "Moderate";
  const label = row.erosion === "n/a" ? "N/A" : row.erosion;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {positive ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className={`h-4 w-4 ${moderate ? "text-amber-400" : "text-rose-400"}`} />}
        <span className="font-bold text-slate-100">{label}</span>
      </div>
      <span className="block text-[10px] text-slate-500">3Y annualized price return: {pct(row.priceRet3y)}</span>
    </div>
  );
}

function QualityValue({ row }: { row: ScreenRow }) {
  if (!row.quality) return <span className="text-slate-500">N/A</span>;
  const tone = row.quality === "A" || row.quality === "B" ? "text-emerald-300" : row.quality === "C" ? "text-amber-300" : "text-rose-300";
  return <span title="Rules-based product-construction grade, not a Morningstar rating" className={`font-mono text-sm font-extrabold ${tone}`}>{row.quality}</span>;
}

function buildOverlap(a: Holding[], b: Holding[]): OverlapResult {
  const bySymbol = new Map(b.flatMap((holding) => holding.symbol && holding.weight != null && holding.weight > 0 ? [[holding.symbol.toUpperCase(), holding] as const] : []));
  const shared = a.flatMap((holding) => {
    if (!holding.symbol || holding.weight == null || holding.weight <= 0) return [];
    const other = bySymbol.get(holding.symbol.toUpperCase());
    if (!other || other.weight == null || other.weight <= 0) return [];
    return [{
      symbol: holding.symbol,
      name: holding.name || other.name || holding.symbol,
      weightA: holding.weight,
      weightB: other.weight,
      sharedWeight: Math.min(holding.weight, other.weight),
    }];
  }).sort((left, right) => right.sharedWeight - left.sharedWeight);
  const sharedWeight = shared.reduce((sum, holding) => sum + holding.sharedWeight, 0);
  return { percent: sharedWeight * 100, shared, holdingsA: a, holdingsB: b };
}

export function LiveEtfCompareView({
  rows,
  availableRows,
  sourceAsOf,
  sourceStale,
  onToggleCompare,
  onBack,
}: LiveEtfCompareViewProps) {
  const [initialInvestment, setInitialInvestment] = useState(100_000);
  const [yearsHorizon, setYearsHorizon] = useState(20);
  const [details, setDetails] = useState<Record<string, HoldingDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [inspectedTicker, setInspectedTicker] = useState<string | null>(null);

  const overlapPair = useMemo(() => rows.slice(0, 2), [rows]);
  useEffect(() => {
    const controller = new AbortController();
    const pending = overlapPair.filter((row) => !details[row.ticker] && !detailErrors[row.ticker]);
    if (pending.length === 0) return () => controller.abort();

    void Promise.all(pending.map(async (row) => {
      try {
        return { ticker: row.ticker, detail: await loadCompareDetail(row.ticker, controller.signal), error: null as string | null };
      } catch (reason) {
        return { ticker: row.ticker, detail: null, error: reason instanceof Error ? reason.message : "Provider holdings could not be loaded" };
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      const loaded: Record<string, HoldingDetail> = {};
      const failed: Record<string, string> = {};
      for (const result of results) {
        if (result.detail) loaded[result.ticker] = result.detail;
        else if (result.error) failed[result.ticker] = result.error;
      }
      if (Object.keys(loaded).length) setDetails((current) => ({ ...current, ...loaded }));
      if (Object.keys(failed).length) setDetailErrors((current) => ({ ...current, ...failed }));
    });
    return () => controller.abort();
  }, [overlapPair, details, detailErrors]);

  const overlap = useMemo(() => {
    if (overlapPair.length < 2) return null;
    const first = details[overlapPair[0].ticker]?.fund.profile?.holdings;
    const second = details[overlapPair[1].ticker]?.fund.profile?.holdings;
    if (!first || !second) return null;
    return buildOverlap(first, second);
  }, [details, overlapPair]);
  const overlapLoading = overlapPair.length >= 2 && overlapPair.some((row) => !details[row.ticker] && !detailErrors[row.ticker]);

  const chartData = useMemo(() => {
    const periods: { label: string; field: ReturnField }[] = [
      { label: "1Y", field: "r1y" },
      { label: "3Y ann.", field: "r3y" },
      { label: "5Y ann.", field: "r5y" },
    ];
    return periods.map(({ label, field }) => {
      const point: Record<string, string | number | null> = { metric: label };
      rows.forEach((row) => { point[row.ticker] = row[field] == null ? null : row[field]! * 100; });
      return point;
    });
  }, [rows]);
  const hasReturnData = rows.some((row) => row.r1y != null || row.r3y != null || row.r5y != null);

  const matrixRows: { label: string; render: (row: ScreenRow) => ReactNode; emphasized?: boolean }[] = [
    { label: "Strategy Category", render: (row) => <span className="inline-flex rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-sans text-xs font-semibold text-slate-200">{row.category ?? "N/A"}</span> },
    { label: "Product Quality Grade", render: (row) => <><QualityValue row={row} /><span className="ml-2 text-[10px] text-slate-500">rules-based heuristic</span></>, emphasized: true },
    { label: "Price / Daily Change", render: (row) => <><span className="font-bold text-slate-100">{money(row.price)}</span><span className={`ml-2 text-[11px] ${row.changePct != null && row.changePct < 0 ? "text-rose-300" : "text-emerald-300"}`}>{changeLabel(row.changePct)}</span></> },
    { label: "Assets Under Management", render: (row) => <span className="font-mono text-slate-200">{aum(row.aum)}</span> },
    { label: "TTM Distribution Yield", render: (row) => <><span className="text-sm font-bold text-emerald-400">{pct(row.yieldTtm)}</span><span className="ml-2 text-[11px] text-slate-400">{row.freq}</span></>, emphasized: true },
    { label: "5Y Distribution CAGR", render: (row) => {
      const growth = row.divCagr5y;
      return <span className={`font-bold ${growth == null ? "text-slate-500" : growth < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(growth)}<span className="ml-1 text-[10px] font-normal text-slate-500">rolling TTM</span></span>;
    } },
    { label: "Last Historical Ex-Date", render: (row) => <span className="font-mono font-semibold text-cyan-300">{dateLabel(row.lastExDate)}</span> },
    { label: "NAV Erosion Proxy", render: (row) => <ErosionValue row={row} />, emphasized: true },
    { label: "Annual Expense Ratio", render: (row) => <><span className="font-bold text-slate-200">{pct(row.expense)}</span><span className="block text-[10px] text-slate-500">{row.expense == null ? "Annual cost N/A" : `${money(row.expense * 10_000)} / year per $10k invested`}</span></> },
    { label: "YTD Total Return", render: (row) => <span className={`font-mono font-semibold ${row.ytd != null && row.ytd < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.ytd)}</span> },
    { label: "1Y Total Return", render: (row) => <span className={`font-mono font-semibold ${row.r1y != null && row.r1y < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.r1y)}</span> },
    { label: "3Y Total Return (annualized)", render: (row) => <span className={`font-mono font-semibold ${row.r3y != null && row.r3y < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.r3y)}</span>, emphasized: true },
    { label: "5Y Total Return (annualized)", render: (row) => <span className={`font-mono font-semibold ${row.r5y != null && row.r5y < 0 ? "text-rose-300" : "text-slate-200"}`}>{pct(row.r5y)}</span> },
    { label: "Max Drawdown 3Y", render: (row) => <span className="font-mono text-rose-300">{pct(row.dd3y)}</span> },
    { label: "3Y Volatility / Sharpe", render: (row) => <span className="font-mono text-slate-300">{pct(row.vol3y)} / {row.sharpe == null ? "N/A" : row.sharpe.toFixed(2)}</span> },
    { label: "Asset Class / Rate Context", render: (row) => <><span className="text-slate-200">{row.assetClass}</span><span className="block text-[10px] text-slate-500">{row.rateLabel}{row.leveraged ? " · leveraged/inverse" : ""}</span></> },
    { label: "Full Dossier", render: (row) => <button type="button" onClick={() => setInspectedTicker(row.ticker)} className="rounded bg-slate-800 px-3 py-1 font-sans text-xs font-semibold text-slate-200 transition hover:bg-emerald-600 hover:text-slate-950">View Deep Dive →</button> },
  ];

  const comparedRows = rows.slice(0, 3);
  const addableRows = availableRows.filter((row) => !comparedRows.some((selected) => selected.ticker === row.ticker)).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const inspectedRow = comparedRows.find((row) => row.ticker === inspectedTicker) ?? null;
  const feeCosts = comparedRows.map((row) => {
    const annual = row.expense == null ? null : initialInvestment * row.expense;
    return { row, annual, cumulative: annual == null ? null : annual * yearsHorizon };
  });
  const firstName = comparedRows[0]?.ticker ?? "Fund A";
  const secondName = comparedRows[1]?.ticker ?? "Fund B";

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2"><Layers className="h-6 w-6 text-emerald-400" /><h1 className="text-2xl font-extrabold text-white">ETF Head-to-Head Comparison</h1></div>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">Compare provider-backed costs, distributions, returns, risk, and reported holdings side by side.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="live-compare-add" className="text-xs font-mono text-slate-400">Add Fund:</label>
          <select id="live-compare-add" disabled={comparedRows.length >= 3 || addableRows.length === 0} defaultValue="" onChange={(event) => { const row = addableRows.find((item) => item.ticker === event.currentTarget.value); if (row) onToggleCompare(row); event.currentTarget.value = ""; }} className="max-w-xs rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs font-mono text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50">
            <option value="" disabled>{comparedRows.length >= 3 ? "Compare limit reached" : addableRows.length ? "+ Select live ETF to compare…" : "No other stored live funds"}</option>
            {addableRows.map((row) => <option key={row.ticker} value={row.ticker}>{row.ticker} — {row.name ?? "Fund name unavailable"}</option>)}
          </select>
          <button onClick={onBack} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:text-white">Back to Live ETF Research</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {comparedRows.map((row, index) => <div key={row.ticker} className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-1.5 text-xs font-mono font-bold text-white shadow-sm"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: FUND_COLORS[index % FUND_COLORS.length] }} /><span>{row.ticker}</span><span className="max-w-52 truncate font-sans text-[11px] font-normal text-slate-400">({row.name ?? "Fund name unavailable"})</span><button type="button" onClick={() => onToggleCompare(row)} aria-label={`Remove ${row.ticker} from comparison`} className="ml-1 text-slate-500 hover:text-rose-400"><X className="h-3.5 w-3.5" /></button></div>)}
        {comparedRows.length === 0 && <p className="text-xs text-slate-500">No funds selected. Add stored funds from the dropdown above.</p>}
        {comparedRows.length === 1 && <p className="text-xs text-slate-500">Add at least one more fund to make a head-to-head comparison.</p>}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-[10px] leading-relaxed text-cyan-100/80"><Database className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><p>Live comparison only: every fund column comes from the stored provider-backed ETF rows, never the bundled sample dataset. Quote snapshot {timestampLabel(sourceAsOf)}{sourceStale ? " · stale-on-error snapshot" : ""}. Missing metrics remain N/A; the quality grade is a rules-based product heuristic and NAV erosion is a market-price proxy.</p></div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs font-mono">
            <thead className="border-b border-slate-800 bg-slate-950 uppercase tracking-wider text-slate-400"><tr><th className="w-56 px-4 py-3 font-sans font-bold">Key Metric</th>{comparedRows.map((row, index) => <th key={row.ticker} className="px-4 py-3"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FUND_COLORS[index % FUND_COLORS.length] }} /><span className="text-sm font-extrabold text-white">{row.ticker}</span></div></th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800/80 font-medium">
              {comparedRows.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center font-sans text-slate-500">Select live funds above to populate the comparison.</td></tr> : matrixRows.map((metric) => <tr key={metric.label} className={`transition hover:bg-slate-800/50 ${metric.emphasized ? "bg-slate-950/30" : ""}`}><td className="px-4 py-3 font-sans text-slate-400">{metric.label}</td>{comparedRows.map((row) => <td key={`${metric.label}-${row.ticker}`} className="px-4 py-3 text-slate-200">{metric.render(row)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <Section>
        <div><h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-white"><TrendingUp className="h-4 w-4 text-emerald-400" />Total Return History Comparison (Reinvested Distributions)</h3><p className="text-xs text-slate-400">Stored 1Y total return and annualized 3Y / 5Y total returns. Periods without enough source history are omitted, not treated as zero.</p></div>
        <div className="h-64 min-h-[250px] w-full min-w-0">{hasReturnData && comparedRows.length ? <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="metric" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} /><YAxis stroke="#64748b" tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", color: "#f8fafc", fontSize: "12px" }} /><Legend />{comparedRows.map((row, index) => <Bar key={row.ticker} dataKey={row.ticker} fill={FUND_COLORS[index % FUND_COLORS.length]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">No stored total-return periods are available for the selected funds.</div>}</div>
        <p className="text-[10px] leading-relaxed text-slate-500">Returns are computed from distribution-adjusted stored history. 3Y and 5Y values are annualized; they are not cumulative return totals.</p>
      </Section>

      <Section>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="flex items-center gap-2 text-base font-bold text-white"><Zap className="h-5 w-5 text-amber-400" />Fund Overlap: {firstName} vs {secondName}</h3><p className="mt-0.5 text-xs text-slate-400">Shared reported top-holdings weight for the first two selected funds; this is not a complete portfolio-overlap estimate.</p></div>{overlap && <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-center font-mono"><span className="block text-[10px] uppercase text-slate-400">Shared top-holdings proxy</span><span className="text-xl font-bold text-amber-400">{pct(overlap.percent / 100)}</span></div>}</div>
        {comparedRows.length < 2 ? <p className="rounded-lg border border-dashed border-slate-800 p-4 text-xs text-slate-500">Select two funds to compare their provider-reported holdings.</p> : overlapLoading ? <p className="text-xs text-slate-400">Loading provider-reported holdings for {firstName} and {secondName}…</p> : overlap ? <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300"><span className="block font-mono font-bold text-white">Overlap Rationale</span><p className="leading-relaxed">{overlap.shared.length ? `${overlap.shared.length} shared ticker${overlap.shared.length === 1 ? "" : "s"} appear in the available top-holdings lists. The proxy sums the smaller reported weight for each shared holding.` : "No shared ticker was found in the provider-reported top-holdings lists."} Coverage is limited to the holdings supplied by the provider.</p><p className="text-[10px] text-slate-500">Reported positions: {firstName} {overlap.holdingsA.length} · {secondName} {overlap.holdingsB.length}</p></div><div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-xs"><span className="mb-2 block font-mono font-bold text-white">Top Shared Holdings</span>{overlap.shared.length ? <div className="space-y-2">{overlap.shared.slice(0, 6).map((holding) => <div key={holding.symbol} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b border-slate-800/70 pb-2 text-[11px] last:border-0"><span className="font-mono font-bold text-emerald-400">{holding.symbol}<span className="ml-1 font-sans font-normal text-slate-400">{holding.name}</span></span><span className="text-right font-mono text-slate-300">{firstName}: {pct(holding.weightA)} · {secondName}: {pct(holding.weightB)}</span><span className="col-span-2 text-right text-[10px] text-slate-500">Shared minimum weight: {pct(holding.sharedWeight)}</span></div>)}</div> : <p className="text-slate-500">No shared reported positions.</p>}</div></div> : <div className="space-y-2 text-xs text-slate-500">{overlapPair.filter((row) => detailErrors[row.ticker]).map((row) => <p key={row.ticker}>{row.ticker} holdings unavailable: {detailErrors[row.ticker]}</p>)}<p>Holdings overlap is unavailable because provider-reported positions are missing.</p></div>}
      </Section>

      <Section>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h3 className="flex items-center gap-2 text-base font-bold text-white"><Calculator className="h-5 w-5 text-emerald-400" />Expense Ratio Cost Illustration</h3><p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-400">Uses each live-reported expense ratio. The flat-balance total does not assume investment growth, distributions, or compounding; it is not a forecast of actual fees paid.</p></div><div className="flex items-center gap-4 text-xs font-mono"><label><span className="mb-1 block text-[10px] text-slate-400">Starting balance</span><select value={initialInvestment} onChange={(event) => setInitialInvestment(Number(event.target.value))} className="rounded border border-slate-700 bg-slate-950 p-1.5 font-bold text-slate-200"><option value={25_000}>$25,000</option><option value={50_000}>$50,000</option><option value={100_000}>$100,000</option><option value={500_000}>$500,000</option></select></label><label><span className="mb-1 block text-[10px] text-slate-400">Horizon</span><select value={yearsHorizon} onChange={(event) => setYearsHorizon(Number(event.target.value))} className="rounded border border-slate-700 bg-slate-950 p-1.5 font-bold text-slate-200"><option value={10}>10 years</option><option value={20}>20 years</option><option value={30}>30 years</option></select></label></div></div>
        <div className="grid grid-cols-1 gap-4 font-mono text-xs md:grid-cols-3">{feeCosts.map(({ row, annual, cumulative }) => <div key={row.ticker} className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-4"><div className="flex items-center justify-between border-b border-slate-800 pb-2"><span className="text-sm font-extrabold text-white">{row.ticker}</span><span className="text-slate-400">{pct(row.expense)} expense</span></div><div className="flex justify-between gap-3"><span className="text-slate-400">Annual cost at starting balance</span><span className="font-bold text-emerald-400">{money(annual)}</span></div><div className="flex justify-between gap-3"><span className="text-slate-400">Flat-balance total · {yearsHorizon} years</span><span className="font-bold text-slate-200">{money(cumulative)}</span></div></div>)}</div>
      </Section>

      <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-[10px] leading-relaxed text-slate-500 sm:grid-cols-2"><p><b className="text-slate-300">Distribution growth:</b> 5Y distribution CAGR compares rolling TTM sums five years apart and remains N/A without six years of source history.</p><p><b className="text-slate-300">Ex-date:</b> Last Ex-Date is the latest historical distribution event, not a prediction of the next payment date.</p><p><b className="text-slate-300">NAV erosion:</b> A market-price proxy only; no 0–100 NAV score or official return-of-capital claim is used.</p><p><b className="text-slate-300">Analyst / ratings:</b> No Morningstar stars or analyst consensus is inferred in this comparison. Inspect a fund dossier for additional source-backed details.</p></div>

      {inspectedRow && <LiveEtfDetailModal key={inspectedTicker} row={inspectedRow} onClose={() => setInspectedTicker(null)} isCompared={rows.some((row) => row.ticker === inspectedRow.ticker)} compareCount={rows.length} compareLimitReached={rows.length >= 3 && !rows.some((row) => row.ticker === inspectedRow.ticker)} showLaunchCompare={false} onToggleCompare={onToggleCompare} onOpenCompare={() => {}} />}
    </div>
  );
}
