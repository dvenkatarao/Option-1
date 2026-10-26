import React from 'react';
import { ETFData, WheelStock, ActiveWheelCampaign } from '../../types';
import { MainTabType } from '../layout/Navbar';
import {
  ShieldAlert,
  ShieldCheck,
  RotateCw,
  Sparkles,
  ArrowRight,
  Flame,
  Calendar,
  Layers,
  Zap,
  Info,
} from 'lucide-react';

interface DashboardViewProps {
  etfs: ETFData[];
  wheelStocks: WheelStock[];
  activeCampaigns: ActiveWheelCampaign[];
  onSelectETF: (etf: ETFData) => void;
  onSelectWheelStock: (stock: WheelStock) => void;
  onNavigate: (tab: MainTabType) => void;
  onOpenCompare: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  etfs,
  wheelStocks,
  activeCampaigns,
  onSelectETF,
  onSelectWheelStock,
  onNavigate,
  onOpenCompare,
}) => {
  // Top 3 Wheel Opportunities (sorted by Wheel Suitability Score & Undervaluation)
  const topWheelPicks = [...wheelStocks]
    .sort((a, b) => b.wheelSuitabilityScore - a.wheelSuitabilityScore)
    .slice(0, 3);

  // Spotlight ETFs
  const coreGrowthETF = etfs.find((e) => e.symbol === 'VOO') || etfs[0];
  const divGrowthETF = etfs.find((e) => e.symbol === 'SCHD') || etfs[1];
  const coveredCallETF = etfs.find((e) => e.symbol === 'JEPI') || etfs[2];
  const highErosionETF = etfs.find((e) => e.symbol === 'TSLY') || etfs[etfs.length - 1];

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
              Eliminate emotional trading. Anchor your wealth with low-erosion dividend & index ETFs, while harvesting 15-30% annualized Return on Capital (ROC) by writing cash-secured puts on AAA blue-chips you want to own at a discount.
            </p>

            {/* Quick Strategy Pills */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('wheel')}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-lg shadow-emerald-500/20"
              >
                <RotateCw className="w-4 h-4 animate-spin-slow" />
                <span>Explore Wheel Screener</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onNavigate('etfs')}
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

          {/* KPI Snapshot Widget */}
          <div className="w-full lg:w-80 bg-slate-950/80 border border-slate-800/90 rounded-xl p-4.5 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Model Portfolio Target</span>
              <span className="text-xs font-mono font-bold text-emerald-400">$100,000 Base</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Monthly Income</span>
                <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">$1,280</span>
                <span className="text-[10px] text-slate-500">15.3% Annualized</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Win Rate (POP)</span>
                <span className="text-base font-bold font-mono text-cyan-400 mt-0.5 block">82.4%</span>
                <span className="text-[10px] text-slate-500">Avg Delta: 0.21</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">ETF Core Growth</span>
                <span className="text-base font-bold font-mono text-white mt-0.5 block">+11.2%</span>
                <span className="text-[10px] text-slate-500">5Y Div CAGR</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">NAV Health</span>
                <span className="text-base font-bold font-mono text-emerald-400 mt-0.5 block">94/100</span>
                <span className="text-[10px] text-slate-500">Zero Decay Trap</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Today's High-Conviction Wheel Radar */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white">Today&apos;s Prime Wheel Opportunities</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
                Safe 0.20-0.22 Delta • Wide Moat
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Screened for pristine balance sheets, undervaluation discount, and optimal 30-45 DTE theta decay.
            </p>
          </div>

          <button
            onClick={() => onNavigate('wheel')}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition self-start sm:self-auto"
          >
            <span>View All {wheelStocks.length} Blue-Chips</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topWheelPicks.map((stock) => {
            const bestPut = stock.optionChains[0]?.puts[1] || stock.optionChains[0]?.puts[0];
            return (
              <div
                key={stock.symbol}
                className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 transition-all shadow-md group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-mono font-bold text-white group-hover:text-emerald-400 transition">
                          {stock.symbol}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold">
                          Score {stock.wheelSuitabilityScore}/100
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">{stock.name}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-mono font-bold text-slate-100">${stock.price.toFixed(2)}</span>
                      <span className="text-[11px] font-mono text-emerald-400 block">+{stock.change24h}%</span>
                    </div>
                  </div>

                  {/* Stock Fundamentals Snapshot */}
                  <div className="grid grid-cols-3 gap-2 my-3.5 py-2.5 px-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-[11px] font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Undervalued</span>
                      <span className="font-bold text-emerald-400">+{stock.undervaluationPercent}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Moat Rating</span>
                      <span className="font-bold text-slate-200">{stock.economicMoat}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">IV Rank</span>
                      <span className="font-bold text-cyan-400">{stock.ivRank}%</span>
                    </div>
                  </div>

                  {/* Recommended Put Strike Info */}
                  {bestPut && (
                    <div className="space-y-1.5 text-xs bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-3">
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-400 font-medium">Recommended Put:</span>
                        <span className="font-mono font-bold text-emerald-300">
                          ${bestPut.strike} Strike (35 DTE)
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-400">Premium / Win Rate:</span>
                        <span className="font-mono text-slate-100">
                          ${bestPut.premiumReceived} ({bestPut.probabilityOfProfit}% POP)
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Annualized ROC:</span>
                        <span className="font-mono font-extrabold text-emerald-400 text-sm">
                          {bestPut.annualizedROC}%
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="mt-3 text-[11px] text-slate-400 leading-tight line-clamp-2">
                    {stock.whyGoodForWheel}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-mono">
                    Collateral: ${((bestPut?.collateralRequired || 10000)).toLocaleString()}
                  </span>
                  <button
                    onClick={() => onSelectWheelStock(stock)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-200 text-xs font-semibold transition"
                  >
                    <span>Simulate Wheel</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: ETF Intelligence Spotlight & NAV Health Alert */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white">ETF Architecture & NAV Erosion Health</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
                Physical Compounding vs Covered Call Derivatives
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Compare fundamental growth stalwarts with high-yield covered call ETFs to avoid destructive principal erosion.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCompare}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              Side-by-Side Compare
            </button>
            <button
              onClick={() => onNavigate('etfs')}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
            >
              <span>Explore All {etfs.length} ETFs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Broad Index Core */}
          <div
            onClick={() => onSelectETF(coreGrowthETF)}
            className="cursor-pointer bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-4.5 transition group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-lg text-white group-hover:text-emerald-400">
                  {coreGrowthETF.symbol}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold font-mono">
                  {coreGrowthETF.categoryLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-1">{coreGrowthETF.name}</p>

              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">5Y Total Return:</span>
                  <span className="font-bold text-emerald-400">+104.2%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expense Ratio:</span>
                  <span className="text-slate-200">{coreGrowthETF.expenseRatio}% (Ultra Low)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NAV Health:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> 98/100
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Div Yield: {coreGrowthETF.dividendYield}%</span>
              <span className="text-emerald-400 group-hover:translate-x-1 transition font-medium flex items-center gap-1">
                Deep Dive <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Card 2: Dividend Growth */}
          <div
            onClick={() => onSelectETF(divGrowthETF)}
            className="cursor-pointer bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-4.5 transition group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-lg text-white group-hover:text-emerald-400">
                  {divGrowthETF.symbol}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold font-mono">
                  {divGrowthETF.categoryLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-1">{divGrowthETF.name}</p>

              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Dividend Yield:</span>
                  <span className="font-bold text-emerald-400">{divGrowthETF.dividendYield}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">5Y Div CAGR:</span>
                  <span className="text-emerald-300 font-bold">+{divGrowthETF.fiveYearDivGrowth}%/yr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NAV Health:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> 95/100
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Ex-Div: {divGrowthETF.exDividendDate}</span>
              <span className="text-emerald-400 group-hover:translate-x-1 transition font-medium flex items-center gap-1">
                Deep Dive <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Card 3: Safe Covered Call */}
          <div
            onClick={() => onSelectETF(coveredCallETF)}
            className="cursor-pointer bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-4.5 transition group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-lg text-white group-hover:text-emerald-400">
                  {coveredCallETF.symbol}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold font-mono">
                  Covered Call
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-1">{coveredCallETF.name}</p>

              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Monthly Yield:</span>
                  <span className="font-bold text-emerald-400">{coveredCallETF.dividendYield}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Strategy:</span>
                  <span className="text-slate-300">OTM S&P Calls</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NAV Health:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> 84/100 (Safe)
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Frequency: Monthly</span>
              <span className="text-emerald-400 group-hover:translate-x-1 transition font-medium flex items-center gap-1">
                Deep Dive <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Card 4: Erosion Risk Case Study */}
          <div
            onClick={() => onSelectETF(highErosionETF)}
            className="cursor-pointer bg-rose-950/20 hover:bg-rose-950/30 border border-rose-900/40 hover:border-rose-700/60 rounded-xl p-4.5 transition group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-lg text-rose-300">
                  {highErosionETF.symbol}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold font-mono">
                  Erosion Warning
                </span>
              </div>
              <p className="text-xs text-slate-400 line-clamp-1">{highErosionETF.name}</p>

              <div className="mt-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Nominal Yield:</span>
                  <span className="font-bold text-amber-400">{highErosionETF.dividendYield}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">1Y Price Loss:</span>
                  <span className="text-rose-400 font-bold">-38.5%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">NAV Health:</span>
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> 18/100 (Decay)
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-rose-900/40 flex items-center justify-between text-[11px] text-slate-400">
              <span className="text-rose-400">Synthetic Decay Trap</span>
              <span className="text-rose-300 group-hover:translate-x-1 transition font-medium flex items-center gap-1">
                Inspect Risk <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Active Wheel Campaigns & Execution Tracker */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <RotateCw className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Active Wheel Strategy Campaigns</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                {activeCampaigns.length} Active Positions
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time monitoring of Cash-Secured Puts, Stock Assignments, and Covered Call roll opportunities.
            </p>
          </div>

          <button
            onClick={() => onNavigate('wheel')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition shadow-md"
          >
            <span>Wheel Manager</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeCampaigns.map((camp) => (
            <div
              key={camp.id}
              className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-base">{camp.symbol}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      {camp.currentStep.replace('_', ' ')}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded ${
                      camp.status === 'In Profit'
                        ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40'
                        : 'text-amber-400 bg-amber-950/60 border border-amber-800/40'
                    }`}
                  >
                    {camp.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono my-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Target Strike:</span>
                    <span className="text-slate-100 font-bold">${camp.targetStrike.toFixed(2)} {camp.optionType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Premium:</span>
                    <span className="text-emerald-400 font-bold">+${camp.premiumCollectedTotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Net Cost Basis:</span>
                    <span className="text-cyan-300 font-bold">${camp.netCostBasisPerShare.toFixed(2)}/sh</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Annualized ROC:</span>
                    <span className="text-amber-400 font-bold">{camp.annualizedROC}%</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-tight">
                  {camp.notes}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {camp.dteRemaining > 0 ? `${camp.dteRemaining} DTE Remaining` : 'Expiring / Assigned'}
                </span>
                <span className="font-mono text-emerald-400 font-semibold">
                  PnL: +${camp.unrealizedPnL + camp.realizedPnL}
                </span>
              </div>
            </div>
          ))}
        </div>
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
