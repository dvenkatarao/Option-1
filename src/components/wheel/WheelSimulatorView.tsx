import React, { useState } from 'react';
import { WheelStock, OptionContract } from '../../types';
import { computeWheelCycleMetrics, generatePayoffCurve } from '../../utils/financialMath';
import {
  RotateCw,
  Sparkles,
  Activity,
  Calculator,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface WheelSimulatorViewProps {
  stocks: WheelStock[];
  initialStock?: WheelStock;
  initialOption?: OptionContract;
  onOpenCampaignLogger?: (symbol: string) => void;
}

export const WheelSimulatorView: React.FC<WheelSimulatorViewProps> = ({
  stocks,
  initialStock,
  initialOption,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    initialStock?.symbol || stocks[0]?.symbol || 'MSFT'
  );

  const currentStock = stocks.find((s) => s.symbol === selectedSymbol) || stocks[0];

  // Parameters
  const [contracts, setContracts] = useState<number>(1);
  const [putStrike, setPutStrike] = useState<number>(
    initialOption?.type === 'PUT' ? initialOption.strike : currentStock.recommendedStrike
  );
  const [putPremium, setPutPremium] = useState<number>(
    initialOption?.type === 'PUT'
      ? initialOption.bid
      : currentStock.optionChains[0]?.puts[1]?.bid || 5.9
  );
  const [dte, setDte] = useState<number>(35);
  const [callStrike, setCallStrike] = useState<number>(
    Math.round(currentStock.price * 1.05)
  );
  const [callPremium, setCallPremium] = useState<number>(4.2);
  const [dividendPerShare, setDividendPerShare] = useState<number>(
    Number((currentStock.price * (currentStock.dividendYield / 100) / 4).toFixed(2))
  );

  const [activeTab, setActiveTab] = useState<'flow' | 'payoff' | 'basis_table'>('flow');

  // Compute live cycle metrics
  const metrics = computeWheelCycleMetrics({
    stock: currentStock,
    putStrike,
    putPremium,
    dte,
    callStrike,
    callPremium,
    dividendPerShare,
    contracts,
  });

  // Payoff data
  const payoffData = generatePayoffCurve('FULL_CYCLE', putStrike, putPremium, callStrike, callPremium);

  // Multi-cycle cost basis reduction projection
  const multiCycleData = [
    {
      cycle: 'Cycle 1 (Initial Put)',
      action: `Sell $${putStrike} Put`,
      premiumEarned: putPremium * 100 * contracts,
      effectiveBasis: putStrike - putPremium,
      reductionPercent: ((putPremium / putStrike) * 100).toFixed(1),
    },
    {
      cycle: 'Cycle 2 (Assigned + Call 1)',
      action: `Sell $${callStrike} Call + Div`,
      premiumEarned: (callPremium + dividendPerShare) * 100 * contracts,
      effectiveBasis: putStrike - putPremium - callPremium - dividendPerShare,
      reductionPercent: (((putPremium + callPremium + dividendPerShare) / putStrike) * 100).toFixed(1),
    },
    {
      cycle: 'Cycle 3 (Call 2 Roll)',
      action: `Sell $${callStrike + 5} Call`,
      premiumEarned: (callPremium * 0.9) * 100 * contracts,
      effectiveBasis: putStrike - putPremium - callPremium * 1.9 - dividendPerShare,
      reductionPercent: (((putPremium + callPremium * 1.9 + dividendPerShare) / putStrike) * 100).toFixed(1),
    },
    {
      cycle: 'Cycle 4 (Call 3 Roll)',
      action: `Sell $${callStrike + 10} Call + Div`,
      premiumEarned: (callPremium * 0.8 + dividendPerShare) * 100 * contracts,
      effectiveBasis: putStrike - putPremium - callPremium * 2.7 - dividendPerShare * 2,
      reductionPercent: (((putPremium + callPremium * 2.7 + dividendPerShare * 2) / putStrike) * 100).toFixed(1),
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Stock Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <RotateCw className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white">Interactive Wheel Strategy Simulator</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Simulate the full 4-phase lifecycle: harvest put premium, calculate net cost basis reduction upon assignment, and model covered call cash flow.
          </p>
        </div>

        {/* Stock Selector Pill */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono">Select Blue-Chip:</span>
          <select
            value={selectedSymbol}
            onChange={(e) => {
              const sym = e.target.value;
              setSelectedSymbol(sym);
              const st = stocks.find((s) => s.symbol === sym);
              if (st) {
                setPutStrike(st.recommendedStrike);
                setPutPremium(st.optionChains[0]?.puts[1]?.bid || 4.5);
                setCallStrike(Math.round(st.price * 1.05));
                setDividendPerShare(Number((st.price * (st.dividendYield / 100) / 4).toFixed(2)));
              }
            }}
            className="bg-slate-900 border border-slate-700 text-sm font-mono font-bold text-emerald-400 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 shadow-md"
          >
            {stocks.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.name} (${s.price.toFixed(2)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top Controls Grid: Live Parameters Input */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
              Wheel Cycle Parameters ({currentStock.symbol} @ ${currentStock.price.toFixed(2)})
            </h2>
          </div>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            Score: {currentStock.wheelSuitabilityScore}/100 • Moat: {currentStock.economicMoat}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
          {/* Contracts */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1 font-sans">Contracts</span>
            <input
              type="number"
              min="1"
              max="20"
              value={contracts}
              onChange={(e) => setContracts(Math.max(1, Number(e.target.value)))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 font-bold text-white text-center focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 block text-center mt-1">
              {metrics.shares} Shares
            </span>
          </div>

          {/* Put Strike */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1 font-sans">Put Strike Price</span>
            <input
              type="number"
              step="1"
              value={putStrike}
              onChange={(e) => setPutStrike(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 font-bold text-emerald-400 text-center focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 block text-center mt-1">
              ${(currentStock.price - putStrike).toFixed(1)} OTM Buffer
            </span>
          </div>

          {/* Put Premium */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1 font-sans">Put Premium / Share</span>
            <input
              type="number"
              step="0.1"
              value={putPremium}
              onChange={(e) => setPutPremium(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 font-bold text-emerald-400 text-center focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-emerald-400 block text-center mt-1">
              +${metrics.putIncome} Total
            </span>
          </div>

          {/* DTE */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1 font-sans">Days to Exp (DTE)</span>
            <input
              type="number"
              min="7"
              max="90"
              value={dte}
              onChange={(e) => setDte(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 font-bold text-cyan-300 text-center focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[10px] text-slate-500 block text-center mt-1">
              Optimal Theta: 30-45d
            </span>
          </div>

          {/* Call Strike */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1 font-sans">Call Strike Price</span>
            <input
              type="number"
              step="1"
              value={callStrike}
              onChange={(e) => setCallStrike(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 font-bold text-cyan-400 text-center focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[10px] text-slate-500 block text-center mt-1">
              +${(callStrike - putStrike).toFixed(1)} Cap Gain
            </span>
          </div>

          {/* Call Premium */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1 font-sans">Call Premium / Share</span>
            <input
              type="number"
              step="0.1"
              value={callPremium}
              onChange={(e) => setCallPremium(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 font-bold text-cyan-400 text-center focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[10px] text-cyan-300 block text-center mt-1">
              +${metrics.callIncome} Total
            </span>
          </div>
        </div>
      </div>

      {/* Simulator Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('flow')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'flow'
              ? 'bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          4-Phase Wheel Lifecycle Flow
        </button>
        <button
          onClick={() => setActiveTab('payoff')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'payoff'
              ? 'bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          Options Payoff Diagram at Expiry
        </button>
        <button
          onClick={() => setActiveTab('basis_table')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'basis_table'
              ? 'bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          Multi-Cycle Cost Basis Reducer
        </button>
      </div>

      {/* TAB 1: 4-Phase Interactive Flow */}
      {activeTab === 'flow' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Phase 1: Cash Secured Put */}
            <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-5 flex flex-col justify-between relative shadow-lg">
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center">
                1
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-emerald-400 block mb-1">
                  Phase 1: Entry
                </span>
                <h3 className="text-base font-bold text-white">Sell Cash-Secured Put</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Commit cash to buy {currentStock.symbol} at a discount while collecting immediate premium.
                </p>

                <div className="mt-4 space-y-2 font-mono text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Put Collateral:</span>
                    <span className="text-slate-100 font-bold">${metrics.putCollateral.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Instant Cash Income:</span>
                    <span className="text-emerald-400 font-bold">+${metrics.putIncome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Annualized Put ROC:</span>
                    <span className="text-emerald-400 font-extrabold">{metrics.putAnnualROC}%/yr</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                <span className="text-emerald-400 font-semibold">Scenario A:</span> If expires OTM, keep ${metrics.putIncome} profit & repeat!
              </div>
            </div>

            {/* Phase 2: Assignment & Cost Basis Reduction */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between relative shadow-lg">
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 font-mono font-bold text-xs flex items-center justify-center">
                2
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-cyan-400 block mb-1">
                  Phase 2: Assignment
                </span>
                <h3 className="text-base font-bold text-white">Receive Stock at Discount</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Assigned {metrics.shares} shares of {currentStock.symbol}. Your put premium directly reduces cost basis!
                </p>

                <div className="mt-4 space-y-2 font-mono text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Nominal Strike:</span>
                    <span className="text-slate-300 font-bold">${putStrike.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Put Premium Credit:</span>
                    <span className="text-emerald-400 font-bold">-${putPremium.toFixed(2)}/sh</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Effective Net Basis:</span>
                    <span className="text-cyan-300 font-extrabold text-sm">${metrics.costBasisIfAssigned}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                <span className="text-cyan-300 font-semibold">Moat Shield:</span> Proud to own AAA blue-chip at {metrics.costBasisReductionPercent}% below market.
              </div>
            </div>

            {/* Phase 3: Covered Call */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between relative shadow-lg">
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-xs flex items-center justify-center">
                3
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-amber-400 block mb-1">
                  Phase 3: Covered Call
                </span>
                <h3 className="text-base font-bold text-white">Sell Covered Call</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sell Call above your net cost basis. Collect second stream of options cash + dividends.
                </p>

                <div className="mt-4 space-y-2 font-mono text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Call Strike:</span>
                    <span className="text-slate-100 font-bold">${callStrike.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Call Income:</span>
                    <span className="text-cyan-400 font-bold">+${metrics.callIncome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">New Net Breakeven:</span>
                    <span className="text-emerald-300 font-bold">${metrics.breakEvenWithCall}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                <span className="text-amber-400 font-semibold">Dual Income:</span> Collect dividends (${metrics.divIncome}) while waiting for expiry.
              </div>
            </div>

            {/* Phase 4: Called Away / Reset */}
            <div className="bg-gradient-to-br from-emerald-950/30 to-slate-900 border border-emerald-500/50 rounded-2xl p-5 flex flex-col justify-between relative shadow-xl">
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-mono font-bold text-xs flex items-center justify-center">
                4
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-emerald-400 block mb-1">
                  Phase 4: Full Cycle ROI
                </span>
                <h3 className="text-base font-bold text-white">Shares Called Away / Win</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Capital is unlocked at a massive profit. Re-enter Phase 1 and restart the wheel.
                </p>

                <div className="mt-4 space-y-2 font-mono text-xs bg-slate-950/90 p-3 rounded-xl border border-emerald-800/40">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Premiums + Div:</span>
                    <span className="text-emerald-400 font-bold">+${metrics.putIncome + metrics.callIncome + metrics.divIncome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Capital Appreciation:</span>
                    <span className="text-cyan-300 font-bold">+${metrics.capitalGainIfCalled}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5">
                    <span className="text-white font-bold">Total Net Profit:</span>
                    <span className="text-emerald-400 font-extrabold text-sm">+${metrics.totalCycleProfit}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Annualized ROI:</span>
                <span className="text-emerald-400 font-extrabold text-sm">{metrics.totalAnnualizedROI}%/yr</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Payoff Diagram */}
      {activeTab === 'payoff' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Wheel Payoff Profile at Expiration (${currentStock.symbol})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Shows dollar profit & loss across underlying stock prices at expiration date.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-emerald-400">Max Profit: +${metrics.totalCycleProfit}</span>
              <span className="text-cyan-300">Breakeven: ${metrics.breakEvenWithCall}</span>
            </div>
          </div>

          <div className="h-72 w-full min-w-0 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={240}>
              <LineChart data={payoffData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="price" stroke="#64748b" tickFormatter={(p) => `$${p}`} tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any) => [`$${val}`, 'P&L at Expiry']}
                  labelFormatter={(lbl) => `Stock Price: $${lbl}`}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                <ReferenceLine x={putStrike} stroke="#10b981" label={{ value: 'Put Strike', fill: '#10b981', fontSize: 10 }} />
                <ReferenceLine x={callStrike} stroke="#06b6d4" label={{ value: 'Call Strike', fill: '#06b6d4', fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="pnl"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 3: Multi-Cycle Cost Basis Reducer Table */}
      {activeTab === 'basis_table' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                The Power of Multi-Cycle Cost Basis Reduction
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                How running consecutive Wheel cycles systematically pulls down your true stock purchase price.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-3 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Initial Price: ${currentStock.price.toFixed(2)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Cycle Step</th>
                  <th className="py-3 px-4">Action Executed</th>
                  <th className="py-3 px-4 text-right">Income Earned</th>
                  <th className="py-3 px-4 text-right">Effective Cost Basis</th>
                  <th className="py-3 px-4 text-right">Discount from Initial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-medium">
                {multiCycleData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-850 transition">
                    <td className="py-3 px-4 font-bold text-white">{row.cycle}</td>
                    <td className="py-3 px-4 text-slate-300 font-sans">{row.action}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">
                      +${row.premiumEarned.toFixed(0)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-cyan-300 text-sm">
                      ${row.effectiveBasis.toFixed(2)}/sh
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">
                      -{row.reductionPercent}% Off
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
