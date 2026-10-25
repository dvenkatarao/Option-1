import React, { useState } from 'react';
import { WheelStock, OptionContract } from '../../types';
import {
  X,
  Play,
  RotateCw,
  Calendar,
  Flame,
} from 'lucide-react';

interface WheelOptionChainModalProps {
  stock: WheelStock | null;
  onClose: () => void;
  onSelectOptionForSim: (stock: WheelStock, option: OptionContract) => void;
}

export const WheelOptionChainModal: React.FC<WheelOptionChainModalProps> = ({
  stock,
  onClose,
  onSelectOptionForSim,
}) => {
  const [selectedChainIdx, setSelectedChainIdx] = useState<number>(0);
  const [optionSide, setOptionSide] = useState<'PUTS' | 'CALLS' | 'BOTH'>('BOTH');

  if (!stock) return null;

  const currentChain = stock.optionChains[selectedChainIdx] || stock.optionChains[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center font-mono font-extrabold text-xl text-emerald-400">
              {stock.symbol}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white">{stock.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
                  Wheel Score: {stock.wheelSuitabilityScore}/100
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 font-mono">
                <span>Price: <strong className="text-white">${stock.price.toFixed(2)}</strong></span>
                <span>•</span>
                <span>IV Rank: <strong className="text-cyan-300">{stock.ivRank}%</strong></span>
                <span>•</span>
                <span>Moat: <strong className="text-emerald-400">{stock.economicMoat}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Earnings Safety Indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Next Earnings:</span>
              <span className="font-bold text-slate-200">{stock.daysToEarnings}d away</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Expiration Date Selector Tabs */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-slate-400 font-mono font-semibold">Expirations:</span>
            {stock.optionChains.map((chain, idx) => (
              <button
                key={chain.expiration}
                onClick={() => setSelectedChainIdx(idx)}
                className={`px-3 py-1.5 rounded-lg font-mono font-bold transition flex items-center gap-1.5 ${
                  selectedChainIdx === idx
                    ? 'bg-emerald-600 text-slate-950 shadow-md shadow-emerald-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>{chain.expiration}</span>
                <span className="text-[10px] opacity-80">({chain.dte} DTE)</span>
                {chain.dte >= 30 && chain.dte <= 45 && (
                  <span className="text-[9px] bg-slate-950/60 text-emerald-200 px-1 py-0.2 rounded">
                    ★ Sweet Spot
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Option Side Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setOptionSide('PUTS')}
              className={`px-3 py-1 rounded text-xs font-bold transition ${
                optionSide === 'PUTS' ? 'bg-emerald-600 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Puts Only (Phase 1)
            </button>
            <button
              onClick={() => setOptionSide('BOTH')}
              className={`px-3 py-1 rounded text-xs font-bold transition ${
                optionSide === 'BOTH' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Both Sides
            </button>
            <button
              onClick={() => setOptionSide('CALLS')}
              className={`px-3 py-1 rounded text-xs font-bold transition ${
                optionSide === 'CALLS' ? 'bg-cyan-600 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Calls Only (Phase 3)
            </button>
          </div>
        </div>

        {/* Option Chain Table */}
        <div className="p-4 overflow-y-auto flex-1">
          {currentChain && (
            <div className="space-y-6">
              {/* Puts Section */}
              {(optionSide === 'PUTS' || optionSide === 'BOTH') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      Cash-Secured Puts (Phase 1 — Enter At a Discount)
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target Delta: 0.15 - 0.25 (75-85% Probability of Profit)
                    </span>
                  </div>

                  <div className="overflow-x-auto bg-slate-950 border border-slate-800 rounded-xl shadow-inner">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3 text-center">Strike</th>
                          <th className="py-2.5 px-3 text-right">Bid / Ask</th>
                          <th className="py-2.5 px-3 text-right">Premium</th>
                          <th className="py-2.5 px-3 text-right">Delta (Δ)</th>
                          <th className="py-2.5 px-3 text-right">Daily Theta</th>
                          <th className="py-2.5 px-3 text-right">Prob of Profit (POP)</th>
                          <th className="py-2.5 px-3 text-right">Downside Buffer</th>
                          <th className="py-2.5 px-3 text-right">Net Breakeven</th>
                          <th className="py-2.5 px-3 text-right">Annualized ROC</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {currentChain.puts.map((opt) => {
                          const isRecommended = Math.abs(opt.delta) >= 0.18 && Math.abs(opt.delta) <= 0.25;
                          return (
                            <tr
                              key={opt.strike}
                              className={`transition ${
                                isRecommended
                                  ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                                  : 'hover:bg-slate-900/60'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center font-bold text-white text-sm">
                                <div className="flex items-center justify-center gap-1">
                                  <span>${opt.strike.toFixed(2)}</span>
                                  {isRecommended && (
                                    <span className="text-[9px] bg-emerald-500 text-slate-950 font-extrabold px-1 py-0.2 rounded">
                                      REC
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300">
                                ${opt.bid.toFixed(2)} / ${opt.ask.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-400 text-sm">
                                ${opt.premiumReceived}
                              </td>
                              <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">
                                {opt.delta.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300">
                                -${Math.abs(opt.theta * 100).toFixed(0)}/d
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                                {opt.probabilityOfProfit}%
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-300">
                                {opt.downsideBuffer}%
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-200">
                                ${opt.breakEven.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-emerald-400 text-sm">
                                {opt.annualizedROC}%
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => onSelectOptionForSim(stock, opt)}
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition"
                                >
                                  <Play className="w-3 h-3 fill-slate-950" />
                                  <span>Simulate</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Calls Section */}
              {(optionSide === 'CALLS' || optionSide === 'BOTH') && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-cyan-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
                      <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                      Covered Calls (Phase 3 — Harvest Upside & Income)
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Target Delta: 0.20 - 0.30 above assigned cost basis
                    </span>
                  </div>

                  <div className="overflow-x-auto bg-slate-950 border border-slate-800 rounded-xl shadow-inner">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3 text-center">Strike</th>
                          <th className="py-2.5 px-3 text-right">Bid / Ask</th>
                          <th className="py-2.5 px-3 text-right">Premium</th>
                          <th className="py-2.5 px-3 text-right">Delta (Δ)</th>
                          <th className="py-2.5 px-3 text-right">Daily Theta</th>
                          <th className="py-2.5 px-3 text-right">Prob of Profit</th>
                          <th className="py-2.5 px-3 text-right">Upside to Strike</th>
                          <th className="py-2.5 px-3 text-right">Annualized ROC</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {currentChain.calls.length > 0 ? (
                          currentChain.calls.map((opt) => (
                            <tr key={opt.strike} className="hover:bg-slate-900/60 transition">
                              <td className="py-2.5 px-3 text-center font-bold text-white text-sm">
                                ${opt.strike.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300">
                                ${opt.bid.toFixed(2)} / ${opt.ask.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-cyan-400 text-sm">
                                ${opt.premiumReceived}
                              </td>
                              <td className="py-2.5 px-3 text-right text-emerald-300 font-bold">
                                {opt.delta.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300">
                                -${Math.abs(opt.theta * 100).toFixed(0)}/d
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                                {opt.probabilityOfProfit}%
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                                +{opt.downsideBuffer}%
                              </td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-cyan-400 text-sm">
                                {opt.annualizedROC}%
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => onSelectOptionForSim(stock, opt)}
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition"
                                >
                                  <Play className="w-3 h-3 fill-slate-950" />
                                  <span>Simulate</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="py-4 text-center text-slate-500">
                              No calls generated for this test expiration.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Real-time Greeks calculated via Black-Scholes model.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Close Option Chain
          </button>
        </div>
      </div>
    </div>
  );
};
