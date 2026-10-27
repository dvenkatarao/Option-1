import React, { useState, useMemo } from 'react';
import { WheelStock, OptionContract } from '../../types';
import { IllustrativeDataNotice } from '../common/IllustrativeDataNotice';
import {
  RotateCw,
  Search,
  SlidersHorizontal,
  Flame,
  Eye,
  Play,
  LayoutGrid,
  List,
} from 'lucide-react';

interface WheelScannerViewProps {
  stocks: WheelStock[];
  onSelectStockForChain: (stock: WheelStock) => void;
  onSelectStockForSimulator: (stock: WheelStock, option?: OptionContract) => void;
  onOpenNewCampaign?: (stock: WheelStock) => void;
}

export const WheelScannerView: React.FC<WheelScannerViewProps> = ({
  stocks,
  onSelectStockForChain,
  onSelectStockForSimulator,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [minROC, setMinROC] = useState<number>(12);
  const [maxDelta, setMaxDelta] = useState<number>(0.30);
  const minDelta = 0.12;
  const [onlyUndervalued, setOnlyUndervalued] = useState<boolean>(true);
  const [onlyWideMoat, setOnlyWideMoat] = useState<boolean>(false);
  const [maxCollateral, setMaxCollateral] = useState<number>(50000);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Filtered stocks logic
  const filteredStocks = useMemo(() => {
    return stocks.filter((stock) => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesSymbol = stock.symbol.toLowerCase().includes(query);
        const matchesName = stock.name.toLowerCase().includes(query);
        const matchesSector = stock.sector.toLowerCase().includes(query);
        if (!matchesSymbol && !matchesName && !matchesSector) return false;
      }

      // Sector
      if (selectedSector !== 'ALL' && stock.sector !== selectedSector) {
        return false;
      }

      // Undervaluation
      if (onlyUndervalued && stock.undervaluationPercent <= 0) {
        return false;
      }

      // Wide Moat
      if (onlyWideMoat && stock.economicMoat !== 'Wide') {
        return false;
      }

      // Best Put Option Checks
      const bestPut = stock.optionChains[0]?.puts.find(
        (p) => Math.abs(p.delta) >= minDelta && Math.abs(p.delta) <= maxDelta
      ) || stock.optionChains[0]?.puts[0];

      if (bestPut) {
        if (bestPut.annualizedROC < minROC) return false;
        if (bestPut.collateralRequired > maxCollateral) return false;
      }

      return true;
    }).sort((a, b) => b.wheelSuitabilityScore - a.wheelSuitabilityScore);
  }, [stocks, searchQuery, selectedSector, minROC, maxDelta, minDelta, onlyUndervalued, onlyWideMoat, maxCollateral]);

  const sectors = ['ALL', 'Technology', 'Healthcare', 'Consumer Staples', 'Industrials', 'Consumer Discretionary'];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <RotateCw className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white">Options Wheel Opportunity Scanner</h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {filteredStocks.length} Sample Blue-Chips
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Explore an illustrative filter of the bundled sample universe. Delta-derived POP is a proxy, not a measured win rate; annualized ROC is scenario math, not a forecast.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded text-xs transition ${
                viewMode === 'cards' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs transition ${
                viewMode === 'table' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <IllustrativeDataNotice detail="This legacy scanner uses bundled sample stock prices, valuation signals, IV metrics, and option chains. These are not current market quotes or tradeable recommendations; use Live Provider Scanner for source-stamped candidates." />

      {/* Sector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {sectors.map((sec) => (
          <button
            key={sec}
            onClick={() => setSelectedSector(sec)}
            className={`px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap font-medium transition-all ${
              selectedSector === sec
                ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/50'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {sec === 'ALL' ? 'All Sectors' : sec}
          </button>
        ))}
      </div>

      {/* Filter Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search blue-chip ticker or name (e.g. MSFT, Apple, JNJ)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-500/60 font-medium placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition w-full sm:w-auto justify-center ${
              showFilters || minROC > 12 || maxDelta < 0.3 || maxCollateral < 50000
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Options Wheel Delta & ROC Sliders</span>
          </button>
        </div>

        {/* Collapsible Options & Quality Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80 text-xs">
            {/* Min ROC Slider */}
            <div>
              <div className="flex justify-between items-center text-slate-400 mb-1.5">
                <span>Min Annualized ROC:</span>
                <span className="font-mono font-bold text-emerald-400">{minROC}%+</span>
              </div>
              <input
                type="range"
                min="8"
                max="30"
                step="2"
                value={minROC}
                onChange={(e) => setMinROC(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>8% (Lower filter)</span>
                <span>18% (Reference)</span>
                <span>30%+ (Higher filter)</span>
              </div>
            </div>

            {/* Max Put Delta Slider */}
            <div>
              <div className="flex justify-between items-center text-slate-400 mb-1.5">
                <span>Max Target Delta:</span>
                <span className="font-mono font-bold text-cyan-300">Δ {maxDelta.toFixed(2)} ({Math.round((1 - maxDelta) * 100)}% OTM proxy)</span>
              </div>
              <input
                type="range"
                min="0.15"
                max="0.35"
                step="0.02"
                value={maxDelta}
                onChange={(e) => setMaxDelta(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>0.15 (~85% OTM proxy)</span>
                <span>0.22 (~78% OTM proxy)</span>
                <span>0.35 (~65% OTM proxy)</span>
              </div>
            </div>

            {/* Max Collateral per Contract */}
            <div>
              <div className="flex justify-between items-center text-slate-400 mb-1.5">
                <span>Max Collateral / Contract:</span>
                <span className="font-mono font-bold text-slate-200">${maxCollateral.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="10000"
                max="100000"
                step="5000"
                value={maxCollateral}
                onChange={(e) => setMaxCollateral(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>$10k (KO/NVDA)</span>
                <span>$40k (MSFT)</span>
                <span>$100k+ (COST)</span>
              </div>
            </div>

            {/* Moat & Undervaluation Toggles */}
            <div className="flex flex-col justify-center space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={onlyUndervalued}
                  onChange={(e) => setOnlyUndervalued(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                <span>Undervalued Only (&gt; 0% discount)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={onlyWideMoat}
                  onChange={(e) => setOnlyWideMoat(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                <span>Wide Economic Moat Only</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* View Mode: Cards */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStocks.map((stock) => {
            const bestPut = stock.optionChains[0]?.puts.find(
              (p) => Math.abs(p.delta) >= minDelta && Math.abs(p.delta) <= maxDelta
            ) || stock.optionChains[0]?.puts[1] || stock.optionChains[0]?.puts[0];

            return (
              <div
                key={stock.symbol}
                className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 transition shadow-lg flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-xl text-white group-hover:text-emerald-400">
                          {stock.symbol}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
                          Wheel Score {stock.wheelSuitabilityScore}/100
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium">{stock.name}</p>
                    </div>

                    <div className="text-right font-mono">
                      <span className="text-sm font-bold text-slate-100">${stock.price.toFixed(2)}</span>
                      <span
                        className={`text-[10px] block ${
                          stock.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {stock.change24h >= 0 ? `+${stock.change24h}%` : `${stock.change24h}%`}
                      </span>
                    </div>
                  </div>

                  {/* Valuation & Moat Fundamentals */}
                  <div className="grid grid-cols-3 gap-2 my-3.5 py-2 px-3 bg-slate-950/80 rounded-xl border border-slate-800/80 font-mono text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Undervalued</span>
                      <span className="font-bold text-emerald-400">
                        {stock.undervaluationPercent > 0 ? `+${stock.undervaluationPercent}%` : `${stock.undervaluationPercent}%`}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Credit / Moat</span>
                      <span className="font-bold text-slate-200">
                        {stock.qualityRating} • {stock.economicMoat}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">IV Rank</span>
                      <span className="font-bold text-cyan-400">{stock.ivRank}%</span>
                    </div>
                  </div>

                  {/* Primary Recommended Wheel Put Contract */}
                  {bestPut && (
                    <div className="bg-gradient-to-br from-emerald-950/30 to-slate-950/80 border border-emerald-800/40 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between items-center pb-1.5 border-b border-emerald-900/30">
                        <span className="text-slate-300 font-semibold flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-amber-400" />
                          Example 35 DTE put:
                        </span>
                        <span className="font-mono font-bold text-emerald-300 text-sm">
                          ${bestPut.strike} Strike
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Example premium / OTM proxy:</span>
                          <span className="font-bold text-white">
                            ${bestPut.premiumReceived} (~{bestPut.probabilityOfProfit}% OTM proxy)
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Delta / Theta:</span>
                          <span className="text-slate-200">
                            Δ {bestPut.delta} | θ ${Math.abs(bestPut.theta * 100).toFixed(0)}/day
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Breakeven distance:</span>
                          <span className="text-emerald-400 font-bold">{bestPut.downsideBuffer}% to Breakeven</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Annualized ROC:</span>
                          <span className="text-emerald-400 font-extrabold text-xs">
                            {bestPut.annualizedROC}%/yr
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="mt-3 text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {stock.whyGoodForWheel}
                  </p>
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onSelectStockForChain(stock)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Option Chain</span>
                  </button>

                  <button
                    onClick={() => onSelectStockForSimulator(stock, bestPut)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md shadow-emerald-600/20"
                  >
                    <Play className="w-3.5 h-3.5 fill-slate-950" />
                    <span>Simulate Wheel</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Ticker</th>
                <th className="py-3 px-3 text-right">Price</th>
                <th className="py-3 px-3 text-center">Sample score</th>
                <th className="py-3 px-3 text-center">Example moat</th>
                <th className="py-3 px-3 text-right">Example valuation</th>
                <th className="py-3 px-3 text-right">IV Rank</th>
                <th className="py-3 px-3 text-center">Example put strike</th>
                <th className="py-3 px-3 text-right">Premium</th>
                <th className="py-3 px-3 text-right">OTM proxy %</th>
                <th className="py-3 px-3 text-right">Annual ROC</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {filteredStocks.map((stock) => {
                const bestPut = stock.optionChains[0]?.puts[1] || stock.optionChains[0]?.puts[0];
                return (
                  <tr key={stock.symbol} className="hover:bg-slate-850 transition group">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white group-hover:text-emerald-400">{stock.symbol}</span>
                        <span className="text-[11px] text-slate-400 font-sans hidden sm:inline">{stock.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200 font-bold">${stock.price.toFixed(2)}</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-400">{stock.wheelSuitabilityScore}</td>
                    <td className="py-3 px-3 text-center text-slate-300 font-sans">{stock.economicMoat}</td>
                    <td className="py-3 px-3 text-right text-emerald-400 font-bold">+{stock.undervaluationPercent}%</td>
                    <td className="py-3 px-3 text-right text-cyan-300">{stock.ivRank}%</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-300">
                      ${bestPut?.strike || '—'}
                    </td>
                    <td className="py-3 px-3 text-right text-white font-bold">${bestPut?.premiumReceived}</td>
                    <td className="py-3 px-3 text-right text-cyan-400">{bestPut ? `~${bestPut.probabilityOfProfit}%` : "N/A"}</td>
                    <td className="py-3 px-3 text-right font-extrabold text-emerald-400 text-sm">
                      {bestPut?.annualizedROC}%
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 font-sans">
                        <button
                          onClick={() => onSelectStockForChain(stock)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                        >
                          Chain
                        </button>
                        <button
                          onClick={() => onSelectStockForSimulator(stock, bestPut)}
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs"
                        >
                          Simulate
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
