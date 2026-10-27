import React, { useState } from 'react';
import { ETFData } from '../../types';
import { calculateETFOverlap } from '../../utils/financialMath';
import { IllustrativeDataNotice } from '../common/IllustrativeDataNotice';
import {
  Layers,
  ShieldCheck,
  ShieldAlert,
  Star,
  Zap,
  Calculator,
  X,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface ETFCompareViewProps {
  allETFs: ETFData[];
  selectedSymbols: string[];
  onToggleCompare: (symbol: string) => void;
  onSelectETF: (etf: ETFData) => void;
}

export const ETFCompareView: React.FC<ETFCompareViewProps> = ({
  allETFs,
  selectedSymbols,
  onToggleCompare,
  onSelectETF,
}) => {
  const [initialInvestment, setInitialInvestment] = useState<number>(100000);
  const [yearsHorizon, setYearsHorizon] = useState<number>(20);

  // If user has fewer than 2 selected, default to VOO & SCHD
  const activeSymbols =
    selectedSymbols.length >= 2
      ? selectedSymbols.slice(0, 3)
      : ['VOO', 'SCHD', 'JEPI'];

  const comparedETFs = activeSymbols
    .map((sym) => allETFs.find((e) => e.symbol === sym))
    .filter(Boolean) as ETFData[];

  // Calculate Overlap between first 2 funds
  const overlapData =
    comparedETFs.length >= 2
      ? calculateETFOverlap(comparedETFs[0], comparedETFs[1])
      : null;

  // Fee Drag Calculation over horizon
  const feeDragData = comparedETFs.map((etf) => {
    const rate = 0.08; // 8% gross assumed annual return
    const grossFV = initialInvestment * Math.pow(1 + rate, yearsHorizon);
    const netRate = rate - etf.expenseRatio / 100;
    const netFV = initialInvestment * Math.pow(1 + netRate, yearsHorizon);
    const totalFeeLost = Math.round(grossFV - netFV);

    return {
      symbol: etf.symbol,
      expenseRatio: etf.expenseRatio,
      finalPortfolio: Math.round(netFV),
      feesPaidToFund: totalFeeLost,
    };
  });

  // Chart data for returns comparison
  const returnCompareChartData = [
    {
      metric: '1-Year Total Return',
      ...Object.fromEntries(
        comparedETFs.map((e) => [
          e.symbol,
          e.performanceHistory.find((p) => p.period === '1Y')?.navTotalReturn || 0,
        ])
      ),
    },
    {
      metric: '3-Year Total Return',
      ...Object.fromEntries(
        comparedETFs.map((e) => [
          e.symbol,
          e.performanceHistory.find((p) => p.period === '3Y')?.navTotalReturn || 0,
        ])
      ),
    },
    {
      metric: '5-Year Total Return',
      ...Object.fromEntries(
        comparedETFs.map((e) => [
          e.symbol,
          e.performanceHistory.find((p) => p.period === '5Y')?.navTotalReturn || 0,
        ])
      ),
    },
  ];

  const colors = ['#10b981', '#06b6d4', '#a855f7'];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white">ETF Head-to-Head Comparison</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Compare fund strategies, expense drags, NAV erosion risks, and underlying stock overlaps side-by-side.
          </p>
        </div>

        {/* Quick Add Fund Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">Add Fund:</span>
          <select
            onChange={(e) => {
              if (e.target.value) {
                onToggleCompare(e.target.value);
                e.target.value = '';
              }
            }}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-emerald-500 font-mono"
            defaultValue=""
          >
            <option value="" disabled>
              + Select ETF to Compare...
            </option>
            {allETFs
              .filter((e) => !activeSymbols.includes(e.symbol))
              .map((e) => (
                <option key={e.symbol} value={e.symbol}>
                  {e.symbol} — {e.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <IllustrativeDataNotice detail="This comparison uses the bundled demo snapshot and an explicitly hypothetical 8% gross-return assumption in the fee-drag example. It is for education, not a current quote-based comparison or return forecast." />

      {/* Selected ETF Badges */}
      <div className="flex flex-wrap items-center gap-2">
        {comparedETFs.map((etf, idx) => (
          <div
            key={etf.symbol}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-mono font-bold text-white shadow-sm"
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors[idx % colors.length] }}
            ></span>
            <span>{etf.symbol}</span>
            <span className="text-slate-400 font-normal text-[11px]">({etf.name})</span>
            {comparedETFs.length > 2 && (
              <button
                onClick={() => onToggleCompare(etf.symbol)}
                className="text-slate-500 hover:text-rose-400 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Side-by-Side Comparison Matrix Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 w-44 font-sans font-bold">Key Metric</th>
                {comparedETFs.map((etf, idx) => (
                  <th key={etf.symbol} className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: colors[idx % colors.length] }}
                      ></span>
                      <span className="text-sm font-extrabold text-white">{etf.symbol}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-medium">
              {/* Strategy Category */}
              <tr className="hover:bg-slate-850/50">
                <td className="py-3 px-4 text-slate-400 font-sans">Strategy Category</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4 font-sans text-slate-200">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-semibold">
                      {etf.categoryLabel}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Dividend Yield */}
              <tr className="hover:bg-slate-850/50 bg-slate-950/30">
                <td className="py-3 px-4 text-slate-400 font-sans font-semibold">Dividend Yield</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4">
                    <span className="text-sm font-bold text-emerald-400">
                      {etf.dividendYield.toFixed(2)}%
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">
                      ({etf.distributionFrequency})
                    </span>
                  </td>
                ))}
              </tr>

              {/* 5-Yr Dividend CAGR */}
              <tr className="hover:bg-slate-850/50">
                <td className="py-3 px-4 text-slate-400 font-sans">5Y Dividend Growth</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4">
                    <span
                      className={`font-bold ${
                        etf.fiveYearDivGrowth > 5
                          ? 'text-emerald-400'
                          : etf.fiveYearDivGrowth >= 0
                          ? 'text-slate-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {etf.fiveYearDivGrowth > 0 ? `+${etf.fiveYearDivGrowth}%/yr` : `${etf.fiveYearDivGrowth}%/yr`}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Next Ex-Dividend Date */}
              <tr className="hover:bg-slate-850/50">
                <td className="py-3 px-4 text-slate-400 font-sans">Next Ex-Div Date</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4 text-cyan-300 font-semibold">
                    {etf.exDividendDate}
                  </td>
                ))}
              </tr>

              {/* NAV Erosion Health */}
              <tr className="hover:bg-slate-850/50 bg-slate-950/30">
                <td className="py-3 px-4 text-slate-400 font-sans font-semibold">NAV Erosion Health</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      {etf.navHealth === 'Prudent / Minimal Erosion' ? (
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="font-bold text-slate-100">{etf.navErosionScore}/100</span>
                      <span className="text-[10px] text-slate-400">({etf.navHealth.split('/')[0]})</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* Expense Ratio */}
              <tr className="hover:bg-slate-850/50">
                <td className="py-3 px-4 text-slate-400 font-sans">Annual Expense Fee</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4">
                    <span
                      className={`font-bold ${
                        etf.expenseRatio < 0.1 ? 'text-emerald-400' : 'text-slate-300'
                      }`}
                    >
                      {etf.expenseRatio.toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      ${(etf.expenseRatio * 10).toFixed(0)}/yr per $10k
                    </span>
                  </td>
                ))}
              </tr>

              {/* 5-Year Total Return */}
              <tr className="hover:bg-slate-850/50">
                <td className="py-3 px-4 text-slate-400 font-sans font-semibold">5Y Total Return</td>
                {comparedETFs.map((etf) => {
                  const ret5Y = etf.performanceHistory.find((p) => p.period === '5Y')?.navTotalReturn || 0;
                  return (
                    <td key={etf.symbol} className="py-3 px-4 font-bold text-sm text-emerald-400">
                      +{ret5Y}%
                    </td>
                  );
                })}
              </tr>

              {/* Beta & Risk */}
              <tr className="hover:bg-slate-850/50">
                <td className="py-3 px-4 text-slate-400 font-sans">Beta / Sharpe</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4 text-slate-300">
                    β {etf.beta.toFixed(2)} • Sharpe {etf.sharpeRatio.toFixed(2)}
                  </td>
                ))}
              </tr>

              {/* Morningstar Rating */}
              <tr className="hover:bg-slate-850/50">
                <td className="py-3 px-4 text-slate-400 font-sans">Morningstar Rating</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4">
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {Array.from({ length: etf.morningstarRating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                      ))}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Detail Drilldown */}
              <tr>
                <td className="py-3 px-4 text-slate-400 font-sans">Full Dossier</td>
                {comparedETFs.map((etf) => (
                  <td key={etf.symbol} className="py-3 px-4">
                    <button
                      onClick={() => onSelectETF(etf)}
                      className="px-3 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-200 text-xs font-sans font-semibold transition"
                    >
                      View Deep Dive →
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Return Comparison Chart */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Total Return History Comparison (Reinvested Dividends)
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Compares cumulative compound returns across 1-year, 3-year, and 5-year periods.
        </p>

        <div className="h-64 w-full min-w-0 min-h-[250px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
            <BarChart data={returnCompareChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="metric" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
              <Legend />
              {comparedETFs.map((etf, idx) => (
                <Bar
                  key={etf.symbol}
                  dataKey={etf.symbol}
                  fill={colors[idx % colors.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fund Overlap Analysis Section (Between Fund 1 & Fund 2) */}
      {overlapData && comparedETFs.length >= 2 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Fund Overlap: {comparedETFs[0].symbol} vs {comparedETFs[1].symbol}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Understand how much duplicate stock exposure you own by holding both funds simultaneously.
              </p>
            </div>

            <div className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-center">
              <span className="text-[10px] text-slate-400 uppercase block">Weighted Overlap</span>
              <span className="text-xl font-bold text-amber-400">~{overlapData.overlapPercent}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-2">
              <span className="font-bold text-white font-mono block">Overlap Rationale</span>
              <p className="leading-relaxed">
                {overlapData.overlapPercent > 40
                  ? `High Overlap: Holding both ${comparedETFs[0].symbol} and ${comparedETFs[1].symbol} provides significant redundancy in mega-cap technology and healthcare equities.`
                  : `Low / Complementary Overlap: Holding both ${comparedETFs[0].symbol} and ${comparedETFs[1].symbol} offers strong diversification benefits with distinct stock weighting strategies.`}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
              <span className="font-bold text-white font-mono block mb-2">
                Top Shared Stock Holdings
              </span>
              <div className="space-y-1.5 font-mono">
                {overlapData.sharedHoldings.slice(0, 4).map((h) => (
                  <div key={h.symbol} className="flex justify-between items-center text-[11px]">
                    <span className="text-emerald-400 font-bold">{h.symbol} ({h.name})</span>
                    <span className="text-slate-300">
                      {comparedETFs[0].symbol}: {h.weightA}% | {comparedETFs[1].symbol}: {h.weightB}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Expense Fee Drag Calculator */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-emerald-400" />
              Expense Ratio Fee Drag Simulator
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              See the exact dollar destruction caused by high management fees over long compounding horizons.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">Initial Capital:</span>
              <select
                value={initialInvestment}
                onChange={(e) => setInitialInvestment(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded p-1.5 font-bold"
              >
                <option value={25000}>$25,000</option>
                <option value={50000}>$50,000</option>
                <option value={100000}>$100,000</option>
                <option value={500000}>$500,000</option>
              </select>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px]">Horizon:</span>
              <select
                value={yearsHorizon}
                onChange={(e) => setYearsHorizon(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded p-1.5 font-bold"
              >
                <option value={10}>10 Years</option>
                <option value={20}>20 Years</option>
                <option value={30}>30 Years</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {feeDragData.map((f) => (
            <div
              key={f.symbol}
              className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="font-extrabold text-white text-sm">{f.symbol}</span>
                <span className="text-slate-400">{f.expenseRatio}% Fee</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Final Portfolio Value:</span>
                <span className="font-bold text-emerald-400">${f.finalPortfolio.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fees Lost to Fund:</span>
                <span className={`font-bold ${f.feesPaidToFund > 30000 ? 'text-rose-400' : 'text-slate-200'}`}>
                  -${f.feesPaidToFund.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
