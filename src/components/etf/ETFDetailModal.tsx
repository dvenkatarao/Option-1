import React, { useState } from 'react';
import { ETFData } from '../../types';
import { IllustrativeDataNotice } from '../common/IllustrativeDataNotice';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Star,
  CheckCircle2,
  AlertTriangle,
  FileText,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface ETFDetailModalProps {
  etf: ETFData | null;
  onClose: () => void;
  onAddToCompare: (symbol: string) => void;
  isCompared: boolean;
  showCompareActions?: boolean;
  onOpenCompare: () => void;
}

export const ETFDetailModal: React.FC<ETFDetailModalProps> = ({
  etf,
  onClose,
  onAddToCompare,
  isCompared,
  showCompareActions = true,
  onOpenCompare,
}) => {
  const [activeTab, setActiveTab] = useState<'nav_erosion' | 'holdings' | 'dividends' | 'strategy' | 'risk'>('nav_erosion');

  if (!etf) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Top Header */}
        <div className="p-5 sm:p-6 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center font-mono font-extrabold text-xl text-emerald-400">
              {etf.symbol}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">{etf.name}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  {etf.issuer}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                <span className="text-slate-300 font-mono">Category: <strong className="text-emerald-400 font-semibold">{etf.categoryLabel}</strong></span>
                <span>•</span>
                <span className="text-slate-300 font-mono">AUM: <strong className="text-white">${etf.aum}B</strong></span>
                <span>•</span>
                <span className="text-slate-300 font-mono">Expense Ratio: <strong className="text-white">{etf.expenseRatio}%</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {showCompareActions && (
              <>
                <button
                  onClick={() => onAddToCompare(etf.symbol)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
                    isCompared
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isCompared ? 'In Compare List' : '+ Add to Compare'}</span>
                </button>

                {isCompared && (
                  <button
                    onClick={onOpenCompare}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition"
                  >
                    Launch Compare
                  </button>
                )}
              </>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <IllustrativeDataNotice detail="This detail modal uses a bundled demo profile; displayed prices, distributions, holdings, ratings, NAV-health scores, and returns are examples, not provider-verified fund facts. Open Live ETF Research for a source-stamped dossier." className="mx-4 mt-3" />

        {/* Highlight Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-slate-950/60 border-b border-slate-800 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Example price</span>
            <span className="text-base font-bold text-white">${etf.price.toFixed(2)}</span>
            <span className={`text-[10px] block ${etf.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {etf.change24h >= 0 ? `+${etf.change24h}%` : `${etf.change24h}%`} today
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Example yield</span>
            <span className="text-base font-bold text-emerald-400">{etf.dividendYield.toFixed(2)}%</span>
            <span className="text-[10px] text-slate-400 block">Frequency: {etf.distributionFrequency}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Example ex-dividend date</span>
            <span className="text-sm font-bold text-cyan-300 mt-0.5 block">{etf.exDividendDate}</span>
            <span className="text-[10px] text-slate-400 block">Example pay date: {etf.payDate}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Example NAV score</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {etf.navHealth === 'Prudent / Minimal Erosion' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              )}
              <span className="text-sm font-bold text-white">{etf.navErosionScore}/100</span>
            </div>
            <span className="text-[10px] text-slate-400 block">{etf.navHealth.split('/')[0]}</span>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 border-b border-slate-800 bg-slate-900 overflow-x-auto">
          <button
            onClick={() => setActiveTab('nav_erosion')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === 'nav_erosion'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            NAV vs Total Return (Erosion Analysis)
          </button>

          <button
            onClick={() => setActiveTab('holdings')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === 'holdings'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Holdings & Sector Weights ({etf.topHoldings.length})
          </button>

          <button
            onClick={() => setActiveTab('dividends')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === 'dividends'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Dividends & Ex-Date Timeline
          </button>

          <button
            onClick={() => setActiveTab('strategy')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === 'strategy'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Strategy & Execution Mechanics
          </button>

          <button
            onClick={() => setActiveTab('risk')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === 'risk'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Analyst Ratings & Risk Ratios
          </button>
        </div>

        {/* Modal Body / Tab Contents */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: NAV Erosion Analysis */}
          {activeTab === 'nav_erosion' && (
            <div className="space-y-6">
              {/* Erosion Health Assessment Banner */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  etf.navHealth === 'Prudent / Minimal Erosion'
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                    : etf.navHealth === 'Moderate / Yield Offset'
                    ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                    : 'bg-rose-950/30 border-rose-800/60 text-rose-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {etf.navHealth === 'Prudent / Minimal Erosion' ? (
                      <ShieldCheck className="w-6 h-6 text-emerald-400" />
                    ) : etf.navHealth === 'Moderate / Yield Offset' ? (
                      <AlertTriangle className="w-6 h-6 text-amber-400" />
                    ) : (
                      <ShieldAlert className="w-6 h-6 text-rose-400 animate-bounce" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      NAV Health: {etf.navHealth} (Score {etf.navErosionScore}/100)
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {etf.navHealth === 'Prudent / Minimal Erosion'
                        ? 'Demo description: this bundled profile represents a broad-market fund. The NAV-health label and score are illustrative, not a measured assessment of the live fund.'
                        : etf.navHealth === 'Moderate / Yield Offset'
                        ? 'Demo description: this bundled profile models covered-call income with potentially capped upside. Actual NAV and total return depend on the fund, market path, and distributions.'
                        : 'Illustrative erosion warning: this demo scenario pairs a high distribution yield with reduced upside participation and full market downside. Verify live NAV and total-return history; distribution yield alone does not indicate return.'}
                    </p>
                  </div>
                </div>

                <div className="font-mono text-center sm:text-right shrink-0 bg-slate-950/80 px-3 py-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase block">5Y Div CAGR</span>
                  <span className="text-sm font-bold text-white">
                    {etf.fiveYearDivGrowth > 0 ? `+${etf.fiveYearDivGrowth}%/yr` : `${etf.fiveYearDivGrowth}%/yr`}
                  </span>
                </div>
              </div>

              {/* Total Return vs Price Return Interactive Chart */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-400" />
                      Growth of $100: Total Return with Reinvested Dividends vs Price Only
                    </h3>
                    <p className="text-xs text-slate-400">
                      Illustrates whether distributions represent real wealth creation or return of capital.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-3 h-0.5 bg-emerald-400"></span> Total Return (Reinvested)
                    </span>
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-3 h-0.5 bg-cyan-400"></span> Price Return Only
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="w-3 h-0.5 bg-slate-500 stroke-dashed"></span> S&P 500 Benchmark
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full min-w-0 min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                    <LineChart data={etf.navVsPriceChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="year" stroke="#64748b" textAnchor="end" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="navTotalReturnIndex"
                        name="Total Return ($)"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="priceOnlyIndex"
                        name="Price Only ($)"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="benchmarkIndex"
                        name="S&P 500 Benchmark"
                        stroke="#64748b"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Historical Performance Matrix */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider mb-3">
                  Historical Performance Periods (Total Return vs Benchmark)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 font-mono text-center text-xs">
                  {etf.performanceHistory.map((p) => (
                    <div key={p.period} className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{p.period}</span>
                      <span
                        className={`font-bold block mt-0.5 ${
                          p.navTotalReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {p.navTotalReturn > 0 ? `+${p.navTotalReturn}%` : `${p.navTotalReturn}%`}
                      </span>
                      <span className="text-[10px] text-slate-500 block">S&P: +{p.benchmarkReturn}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Underlying Holdings & Sector Breakdown */}
          {activeTab === 'holdings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sector Allocation Breakdown */}
                <div className="lg:col-span-1 bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider mb-3">
                    Sector Allocation Weights
                  </h3>
                  <div className="space-y-2.5">
                    {etf.sectorBreakdown.map((sec) => (
                      <div key={sec.sector} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">{sec.sector}</span>
                          <span className="font-mono font-bold text-emerald-400">{sec.weight}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${sec.weight}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Holdings Table */}
                <div className="lg:col-span-2 bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
                      Top 10 Constituent Holdings
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      Top 10 Weight: ~
                      {etf.topHoldings.reduce((acc, h) => acc + h.weight, 0).toFixed(1)}%
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Ticker</th>
                          <th className="py-2 px-3">Company</th>
                          <th className="py-2 px-3">Sector</th>
                          <th className="py-2 px-3 text-right">P/E</th>
                          <th className="py-2 px-3 text-right">Fund Weight</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono">
                        {etf.topHoldings.map((h) => (
                          <tr key={h.symbol} className="hover:bg-slate-900/60 transition">
                            <td className="py-2.5 px-3 font-bold text-emerald-400">{h.symbol}</td>
                            <td className="py-2.5 px-3 text-slate-200 font-sans font-medium">{h.name}</td>
                            <td className="py-2.5 px-3 text-slate-400 font-sans text-[11px]">{h.sector}</td>
                            <td className="py-2.5 px-3 text-right text-slate-300">
                              {h.peRatio ? `${h.peRatio.toFixed(1)}x` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-white">{h.weight}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Dividend Intelligence & Timeline */}
          {activeTab === 'dividends' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Ex-Dividend Countdown</span>
                  <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
                    {etf.exDividendDate}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Must buy before this date to capture next distribution.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Distribution Frequency</span>
                  <span className="text-xl font-bold font-mono text-cyan-300 mt-1 block">
                    {etf.distributionFrequency} (12x/yr)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ideal for recurring living expenses & cash flow.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-xs text-slate-400 block">5-Year Dividend Growth</span>
                  <span className="text-xl font-bold font-mono text-emerald-300 mt-1 block">
                    +{etf.fiveYearDivGrowth}% CAGR
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Compound yield on cost increases each year.
                  </p>
                </div>
              </div>

              {/* Recent Distributions Table */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider mb-3">
                  Recent Distribution History
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Pay Date</th>
                        <th className="py-2 px-3">Distribution Type</th>
                        <th className="py-2 px-3 text-right">Amount per Share</th>
                        <th className="py-2 px-3 text-right">Est. Annualized</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {etf.dividendHistory.map((d, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="py-2.5 px-3 text-slate-200">{d.date}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                d.type === 'Regular'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {d.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                            ${d.amount.toFixed(3)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            ${(d.amount * (etf.distributionFrequency === 'Monthly' ? 12 : 4)).toFixed(2)}/yr
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Strategy & Execution Mechanics */}
          {activeTab === 'strategy' && (
            <div className="space-y-6">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Strategy Architecture</h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {etf.strategyDescription}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block">Execution Protocol</span>
                    <span className="font-bold text-emerald-400 mt-0.5 block">{etf.strategyExecution}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Options Market Liquidity</span>
                    <span className="font-bold text-cyan-400 mt-0.5 block">{etf.optionsLiquidity}</span>
                  </div>
                </div>
              </div>

              {/* Pros & Risks Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-emerald-950/10 border border-emerald-800/30 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Core Advantages & Pros
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {etf.keyPros.map((pro, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400">•</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-rose-950/10 border border-rose-800/30 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-rose-400 uppercase font-mono tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Risks & Structural Constraints
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {etf.keyRisks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-rose-400">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Risk & Analyst Ratings */}
          {activeTab === 'risk' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">Sharpe Ratio (3Y)</span>
                  <span className="text-base font-bold text-emerald-400 mt-1 block">{etf.sharpeRatio}</span>
                  <span className="text-[10px] text-slate-500">Risk-Adjusted Return</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">Beta (vs S&P 500)</span>
                  <span className="text-base font-bold text-cyan-300 mt-1 block">{etf.beta}</span>
                  <span className="text-[10px] text-slate-500">
                    {etf.beta < 1 ? 'Lower Volatility than SPX' : 'Higher Volatility than SPX'}
                  </span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">Max Drawdown (5Y)</span>
                  <span className="text-base font-bold text-rose-400 mt-1 block">{etf.maxDrawdown5Y}%</span>
                  <span className="text-[10px] text-slate-500">Worst Peak-to-Trough</span>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">Analyst Consensus</span>
                  <span className="text-base font-bold text-white mt-1 block">{etf.analystConsensus}</span>
                  <div className="flex items-center gap-0.5 mt-1 text-amber-400">
                    {Array.from({ length: etf.morningstarRating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-amber-400" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Holdings data & NAV ratios updated for US Markets.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
