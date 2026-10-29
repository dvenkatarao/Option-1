import React, { useEffect, useState } from 'react';
import { DEFAULT_WHEEL_FILTER_QUERY } from '../live/wheel-filter-state';
import { MainTabType } from '../layout/Navbar';
import type { ScreenRow } from '../../types/liveScreener';
import {
  ShieldAlert,
  RotateCw,
  Sparkles,
  ArrowRight,
  Flame,
  Calendar,
  Layers,
  Zap,
  Info,
} from 'lucide-react';

type LiveWheelRow = {
  g: {
    grade: string | null;
    row: { ticker: string; name: string | null; sector: string | null };
  };
  ctx: { price: number };
  best: {
    contract: { strike: number; expiration: string; delta: number | null };
    dte: number;
    credit: number;
    cash: number;
    annRoc: number;
    score: number;
    breakeven: number;
    breakevenCushion: number;
    probOtm: number;
  };
  source: string | null;
  fallbackReason: string | null;
  scannedAt: string;
};

type LiveWheelResults = {
  rows: LiveWheelRow[];
  info: { eligible: number; scanned: number; waiting: number };
  ivRanks: Record<string, number | null>;
  generatedAt: string;
};

type EtfSnapshotResponse = {
  rows: ScreenRow[];
  hydrated: number;
  totalUniverse: number;
  remaining: number;
  universe: { provider: string; configured: boolean; fetchedAt: string | null; stale: boolean };
  refreshedAt: string | null;
  stale: boolean;
};

type SavedWheelPosition = {
  id: string;
  ticker: string;
  side: 'put_sold' | 'assigned' | 'call_sold' | 'closed';
  strike: number;
  expiration: string;
  premium: number;
  quantity: number;
  openedAt: string;
  closedAt: string | null;
  costBasis: number | null;
  notes: string | null;
  createdAt: string;
};

interface DashboardViewProps {
  onNavigate: (tab: MainTabType) => void;
  onViewAllWheelOpportunities: () => void;
  onOpenLiveEtfResearch: () => void;
  onOpenLiveWheelJournal: () => void;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`);
  }
  return body as T;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onViewAllWheelOpportunities,
  onOpenLiveEtfResearch,
  onOpenLiveWheelJournal,
}) => {
  const [liveWheelResults, setLiveWheelResults] = useState<LiveWheelResults | null>(null);
  const [liveWheelLoading, setLiveWheelLoading] = useState(true);
  const [liveWheelError, setLiveWheelError] = useState<string | null>(null);
  const [liveEtfSnapshot, setLiveEtfSnapshot] = useState<EtfSnapshotResponse | null>(null);
  const [liveEtfLoading, setLiveEtfLoading] = useState(true);
  const [liveEtfError, setLiveEtfError] = useState<string | null>(null);
  const [savedWheelPositions, setSavedWheelPositions] = useState<SavedWheelPosition[] | null>(null);
  const [savedWheelLoading, setSavedWheelLoading] = useState(true);
  const [savedWheelError, setSavedWheelError] = useState<string | null>(null);
  const topWheelPicks = liveWheelResults?.rows.slice(0, 3) ?? [];

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLiveWheelLoading(true);
      try {
        const data = await requestJson<LiveWheelResults>(`/api/wheel/results?${DEFAULT_WHEEL_FILTER_QUERY}`);
        if (active) {
          setLiveWheelResults(data);
          setLiveWheelError(null);
        }
      } catch (error) {
        if (active) setLiveWheelError(error instanceof Error ? error.message : 'Live wheel scan unavailable');
      } finally {
        if (active) setLiveWheelLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await requestJson<EtfSnapshotResponse>('/api/etfs');
        if (active) {
          setLiveEtfSnapshot(data);
          setLiveEtfError(null);
        }
      } catch (error) {
        if (active) setLiveEtfError(error instanceof Error ? error.message : 'ETF data is unavailable');
      } finally {
        if (active) setLiveEtfLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    requestJson<{ positions: SavedWheelPosition[] }>('/api/wheel/positions')
      .then((data) => {
        if (active) {
          setSavedWheelPositions(data.positions ?? []);
          setSavedWheelError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setSavedWheelError(error instanceof Error ? error.message : 'Saved wheel journal is unavailable');
      })
      .finally(() => {
        if (active) setSavedWheelLoading(false);
      });
    return () => { active = false; };
  }, []);

  const formatCash = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (value: number | null | undefined, digits = 1) =>
    value == null || !Number.isFinite(value) ? 'N/A' : `${(value * 100).toFixed(digits)}%`;

  const etfRows = liveEtfSnapshot?.rows ?? [];
  const spotlightRows: { row: ScreenRow; label: string }[] = [];
  const usedSpotlightTickers = new Set<string>();
  const addSpotlight = (row: ScreenRow | undefined, label: string) => {
    if (!row || usedSpotlightTickers.has(row.ticker) || spotlightRows.length >= 4) return;
    usedSpotlightTickers.add(row.ticker);
    spotlightRows.push({ row, label });
  };
  addSpotlight(etfRows.find((row) => row.ticker === 'VOO'), 'Broad-market ETF');
  addSpotlight(etfRows.find((row) => row.ticker === 'SCHD'), 'Dividend profile');
  addSpotlight(etfRows.find((row) => row.ticker === 'JEPI'), 'Option-income profile');
  const lowestPriceReturn = [...etfRows]
    .filter((row) => row.priceRet3y != null)
    .sort((a, b) => (a.priceRet3y ?? 0) - (b.priceRet3y ?? 0))[0];
  addSpotlight(lowestPriceReturn, 'Lowest 3Y price-return proxy');
  for (const row of etfRows) addSpotlight(row, 'Additional stored ETF');

  const recentWheelEntries = savedWheelPositions?.slice(0, 3) ?? [];

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Banner / Strategy Architecture */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>The Dual-Engine Portfolio Architecture</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Combine High-Compounding <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-300">ETFs</span> with High-Velocity <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400">Options Wheel</span> Income
            </h1>
            <p className="mt-3 text-slate-300 text-sm md:text-base leading-relaxed">
              Explore how ETF allocation and options-wheel scenarios can interact. Premium income and annualized return on capital vary with market conditions and can be offset by losses, assignment, capped upside, fees, and taxes; these examples are not outcome forecasts.
            </p>

            {/* Quick Strategy Pills */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={onViewAllWheelOpportunities}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-lg shadow-emerald-500/20"
              >
                <RotateCw className="w-4 h-4 animate-spin-slow" />
                <span>Explore Wheel Screener</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onOpenLiveEtfResearch}
                className="inline-flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs border border-slate-700 transition"
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Screen & Inspect ETFs</span>
              </button>

              <button
                onClick={() => onNavigate('portfolio')}
                className="inline-flex items-center gap-2 bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 font-medium px-4 py-2.5 rounded-xl text-xs border border-slate-800 transition"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Dual-Engine Studio</span>
              </button>
            </div>
          </div>

          {/* Provider-backed snapshot; no account or realized-performance figures are inferred. */}
          <div className="w-full lg:w-80 rounded-xl border border-slate-800/90 bg-slate-950/80 p-4.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <span className="text-xs font-medium text-slate-300">Source-Backed Snapshot</span>
              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
                {liveEtfSnapshot ? `Universe: ${liveEtfSnapshot.universe.provider}` : 'Provider data'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-2.5">
                <span className="block font-mono text-[10px] uppercase text-slate-400">Stored ETF histories</span>
                <span className="mt-0.5 block font-mono text-base font-bold text-white">
                  {liveEtfSnapshot ? `${liveEtfSnapshot.hydrated} / ${liveEtfSnapshot.totalUniverse}` : liveEtfLoading ? 'Loading…' : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {liveEtfSnapshot ? `${liveEtfSnapshot.remaining} pending hydration` : 'Database-backed coverage'}
                </span>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-2.5">
                <span className="block font-mono text-[10px] uppercase text-slate-400">Top wheel candidate</span>
                <span className="mt-0.5 block font-mono text-base font-bold text-cyan-300">
                  {topWheelPicks[0]?.g.row.ticker ?? (liveWheelLoading ? 'Loading…' : 'N/A')}
                </span>
                <span className="text-[10px] text-slate-500">{topWheelPicks[0] ? `Grade ${topWheelPicks[0].g.grade ?? 'N/A'} · provider scan` : 'No qualifying scan'}</span>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-2.5">
                <span className="block font-mono text-[10px] uppercase text-slate-400">Modeled annualized ROC</span>
                <span className="mt-0.5 block font-mono text-base font-bold text-emerald-400">
                  {topWheelPicks[0] ? formatPercent(topWheelPicks[0].best.annRoc) : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500">Current candidate estimate</span>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-2.5">
                <span className="block font-mono text-[10px] uppercase text-slate-400">OTM probability proxy</span>
                <span className="mt-0.5 block font-mono text-base font-bold text-amber-300">
                  {topWheelPicks[0] ? formatPercent(topWheelPicks[0].best.probOtm) : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-500">Model output, not a win rate</span>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              ETF quotes may be delayed and wheel metrics are estimates. No brokerage account is connected; balances, holdings, and realized performance are not shown.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Provider-backed wheel opportunities */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white">Top Provider-Scanned Wheel Opportunities</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
                A+ / A Quality • Provider Scanned
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Top candidates from the A-or-better live scanner filter: 21–50 DTE and 0.15–0.30 absolute delta.
            </p>
          </div>

          <button
            onClick={onViewAllWheelOpportunities}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition self-start sm:self-auto"
          >
            <span>
              {liveWheelResults
                ? `View All ${liveWheelResults.rows.length} A+ / A Candidates`
                : 'View All A+ / A Candidates'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {liveWheelError && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
            {liveWheelResults
              ? `Refresh failed: ${liveWheelError}. Showing the last provider scan; check each scan timestamp.`
              : `Live wheel data is unavailable: ${liveWheelError}. No sample candidates are substituted.`}
          </div>
        )}

        {liveWheelLoading && !liveWheelResults ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-400">
            Loading provider-scanned A+ / A opportunities…
          </div>
        ) : !liveWheelResults ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-400">
            Open the Live Provider Scanner to check data-source health and refresh the scan.
          </div>
        ) : topWheelPicks.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <p className="text-sm font-semibold text-slate-200">
              {!liveWheelResults.info.eligible
                ? 'No A+ / A stock fundamentals are hydrated yet.'
                : !liveWheelResults.info.scanned
                  ? 'No provider option-chain scans are available yet.'
                  : 'No contracts currently meet these filters.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {liveWheelResults.info.eligible
                ? `${liveWheelResults.info.scanned} eligible stocks scanned; ${liveWheelResults.info.waiting} still waiting for a scan.`
                : 'The dashboard will not fill empty results with the old sample stock list.'}
            </p>
            <button
              onClick={onViewAllWheelOpportunities}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15"
            >
              Open Live Provider Scanner <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topWheelPicks.map((candidate, index) => {
              const { best, g, ctx } = candidate;
              const contract = best.contract;
              const ivRank = liveWheelResults.ivRanks[g.row.ticker];
              return (
                <div
                  key={g.row.ticker}
                  className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 transition-all shadow-md group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-mono font-bold text-white group-hover:text-emerald-400 transition">
                            {g.row.ticker}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold">
                            Rank #{index + 1}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{g.row.name ?? g.row.sector ?? 'Stock'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono font-bold text-slate-100">{formatCash(ctx.price)}</span>
                        <span className="text-[10px] font-mono text-cyan-300 block">Score {best.score.toFixed(0)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 my-3.5 py-2.5 px-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Quality</span>
                        <span className="font-bold text-emerald-300">{g.grade ?? 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Put Delta</span>
                        <span className="font-bold text-slate-200">{contract.delta == null ? 'N/A' : contract.delta.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">IV Rank</span>
                        <span className="font-bold text-cyan-300">{ivRank == null ? 'N/A' : `${ivRank}%`}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-3">
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-400 font-medium">Cash-secured put:</span>
                        <span className="font-mono font-bold text-emerald-300">
                          {formatCash(contract.strike)} · {contract.expiration}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-emerald-900/30 pt-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block">Est. credit / contract</span>
                          <span className="font-mono font-bold text-white">{formatCash(best.credit * 100)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Prob. OTM*</span>
                          <span className="font-mono font-bold text-slate-200">{formatPercent(best.probOtm)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">DTE · Annualized ROC</span>
                          <span className="font-mono text-slate-200">{best.dte}d · {formatPercent(best.annRoc)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Cash collateral</span>
                          <span className="font-mono text-slate-200">{formatCash(best.cash)}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-500">Breakeven: </span>
                          <span className="font-mono text-slate-200">{formatCash(best.breakeven)} ({formatPercent(best.breakevenCushion)} cushion)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                    <span
                      className="text-[9px] text-slate-500 font-mono"
                      title={candidate.fallbackReason ? `Backup provider used: ${candidate.fallbackReason}` : undefined}
                    >
                      {candidate.source ?? 'Provider'}{candidate.fallbackReason ? ' · backup' : ''} · Scanned {new Date(candidate.scannedAt).toLocaleString()}
                    </span>
                    <button
                      onClick={onViewAllWheelOpportunities}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-200 text-xs font-semibold transition"
                    >
                      Review in Live Scanner <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="mt-2 text-[9px] leading-relaxed text-slate-600">
                    *Model-based probability proxy, not a measured win rate. Quotes may be delayed.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: live ETF history and price-based risk indicators */}
      <div>
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white">ETF Research Snapshot</h2>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-xs text-cyan-300">
                {liveEtfSnapshot ? `${liveEtfSnapshot.hydrated} stored · Universe: ${liveEtfSnapshot.universe.provider}` : 'Provider-backed history'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Stored provider history, distribution metrics, and a market-price erosion proxy. No synthetic returns or NAV scores are substituted.
            </p>
          </div>

          <button
            onClick={onOpenLiveEtfResearch}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15 sm:self-auto"
          >
            <span>Open Live ETF Research</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {liveEtfError && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
            {liveEtfSnapshot
              ? `ETF refresh failed: ${liveEtfError}. Showing the last successful source response.`
              : `Stored ETF research is unavailable: ${liveEtfError}. No example performance is shown.`}
          </div>
        )}

        {liveEtfLoading && !liveEtfSnapshot ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-400">
            Loading stored ETF history and quote coverage…
          </div>
        ) : !liveEtfSnapshot ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center text-sm text-slate-400">
            Configure the database and data providers, then hydrate ETF history in Live ETF Research. Dashboard metrics remain unavailable until source data exists.
          </div>
        ) : etfRows.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <p className="text-sm font-semibold text-slate-200">No ETF history is stored yet.</p>
            <p className="mt-1 text-xs text-slate-500">Use Live ETF Research to check source health and hydrate the configured ETF universe.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {spotlightRows.map(({ row, label }) => {
                const erosionTone = row.erosion === 'Severe'
                  ? 'border-rose-900/50 bg-rose-950/20 hover:border-rose-700/60'
                  : row.erosion === 'Moderate'
                    ? 'border-amber-900/50 bg-amber-950/10 hover:border-amber-700/50'
                    : 'border-slate-800 bg-slate-900/80 hover:border-cyan-500/40';
                return (
                  <button
                    key={`${label}-${row.ticker}`}
                    onClick={onOpenLiveEtfResearch}
                    className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition ${erosionTone}`}
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-lg font-bold text-white group-hover:text-cyan-300">{row.ticker}</span>
                        <span className="rounded border border-slate-700 bg-slate-950/70 px-2 py-0.5 font-mono text-[9px] font-semibold text-slate-300">{label}</span>
                      </div>
                      <p className="line-clamp-1 text-xs text-slate-400">{row.name ?? row.family ?? row.category ?? 'Stored ETF history'}</p>

                      <div className="my-4 space-y-2 font-mono text-xs">
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">5Y annualized total return</span>
                          <span className="font-bold text-slate-100">{formatPercent(row.r5y)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">TTM distribution yield</span>
                          <span className="font-bold text-emerald-300">{formatPercent(row.yieldTtm)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">Expense ratio</span>
                          <span className="text-slate-200">{formatPercent(row.expense, 2)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="flex items-center gap-1 text-slate-500">
                            {row.erosion === 'Severe' || row.erosion === 'Moderate' ? <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> : null}
                            3Y price-return proxy
                          </span>
                          <span className={row.priceRet3y != null && row.priceRet3y < 0 ? 'font-semibold text-amber-300' : 'text-slate-200'}>
                            {formatPercent(row.priceRet3y)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-slate-800/70 pt-2">
                          <span className="text-slate-500">Erosion signal</span>
                          <span className="text-slate-200">{row.erosion || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-[10px] text-slate-500">
                      <span>{row.category ?? row.family ?? 'ETF'}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-cyan-300 transition group-hover:translate-x-1">
                        Inspect source <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              {liveEtfSnapshot.refreshedAt
                ? `Delayed quote snapshot fetched ${new Date(liveEtfSnapshot.refreshedAt).toLocaleString()}${liveEtfSnapshot.stale ? ' · cached/stale' : ''}. `
                : 'Quote timestamp unavailable. '}
              3Y/5Y total returns are annualized from stored adjusted-close history; the erosion proxy uses market price and is not an official NAV or return-of-capital rating.
            </p>
          </>
        )}
      </div>

      {/* Section 3: persisted app journal entries (manual, not broker synced) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <RotateCw className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Saved Wheel Journal</h2>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-300">
                {savedWheelPositions ? `${savedWheelPositions.length} saved entries` : savedWheelLoading ? 'Loading…' : savedWheelError ? 'Unavailable' : 'No entries'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              User-entered journal records only. These are not broker-synced positions; no mark-to-market P&amp;L or account performance is inferred.
            </p>
          </div>

          <button
            onClick={onOpenLiveWheelJournal}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md transition hover:bg-emerald-500 sm:self-auto"
          >
            <span>Open Live Wheel Journal</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {savedWheelError && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
            Saved wheel journal is unavailable: {savedWheelError}. No sample positions are substituted.
          </div>
        )}

        {savedWheelLoading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-8 text-center text-sm text-slate-400">Loading saved journal entries…</div>
        ) : recentWheelEntries.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-8 text-center">
            <p className="text-sm font-semibold text-slate-200">{savedWheelError ? 'Journal data is unavailable.' : 'No saved wheel journal entries.'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {savedWheelError ? 'Check database configuration and source health in the Live Wheel Journal.' : 'Log your own trade details in the Live Wheel Journal to see them here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {recentWheelEntries.map((entry) => {
              const isClosed = entry.side === 'closed' || entry.closedAt != null;
              const stage = entry.side.replaceAll('_', ' ');
              return (
                <div key={entry.id} className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white">{entry.ticker}</span>
                        <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold capitalize text-slate-300">{stage}</span>
                      </div>
                      <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${isClosed ? 'border border-slate-700 bg-slate-800 text-slate-400' : 'border border-emerald-800/40 bg-emerald-950/60 text-emerald-300'}`}>
                        {isClosed ? 'Closed' : 'Journal entry'}
                      </span>
                    </div>

                    <div className="my-3 space-y-2 rounded-lg border border-slate-800/60 bg-slate-900/60 p-2.5 font-mono text-xs">
                      <div className="flex justify-between gap-3"><span className="text-slate-400">Strike</span><span className="font-bold text-slate-100">${entry.strike.toFixed(2)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-400">Recorded premium / share</span><span className="font-bold text-emerald-300">${entry.premium.toFixed(2)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-400">Contracts entered</span><span className="text-slate-200">{entry.quantity}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-400">Expiration</span><span className="text-slate-200">{entry.expiration}</span></div>
                    </div>
                    {entry.notes && <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-400">{entry.notes}</p>}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-slate-500" />Opened {entry.openedAt}</span>
                    <span className="font-mono text-slate-500">Manual entry</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 4: Self-Guided Playbooks & Educational Callouts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => onNavigate('research')}
          className="cursor-pointer group p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 hover:border-emerald-500/50 transition shadow-lg flex items-start gap-4"
        >
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition">
            <RotateCw className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition flex items-center gap-2">
              Wheel Strategy Master Playbook
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Step-by-step guidelines for selecting 0.20 delta strikes, rolling tested positions down & out, and locking in 50% max profits.
            </p>
          </div>
        </div>

        <div
          onClick={() => onNavigate('research')}
          className="cursor-pointer group p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 hover:border-cyan-500/50 transition shadow-lg flex items-start gap-4"
        >
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition flex items-center gap-2">
              NAV Erosion Intelligence Dossier
              <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Understand why 50% distribution yields can result in negative total return, and how to verify organic dividend growth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
