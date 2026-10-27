import React, { useState, useMemo } from 'react';
import { ETFData, ETFStrategyType } from '../../types';
import { IllustrativeDataNotice } from '../common/IllustrativeDataNotice';
import {
  Layers,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Star,
  ExternalLink,
  Plus,
  Check,
  LayoutGrid,
  List,
  AlertTriangle,
} from 'lucide-react';

interface ETFScreenerViewProps {
  etfs: ETFData[];
  onSelectETF: (etf: ETFData) => void;
  selectedForCompare: string[];
  onToggleCompare: (symbol: string) => void;
  onOpenCompare: () => void;
}

export const ETFScreenerView: React.FC<ETFScreenerViewProps> = ({
  etfs,
  onSelectETF,
  selectedForCompare,
  onToggleCompare,
  onOpenCompare,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ETFStrategyType | 'ALL'>('ALL');
  const [minYield, setMinYield] = useState<number>(0);
  const [maxExpenseRatio, setMaxExpenseRatio] = useState<number>(1.0);
  const [navHealthFilter, setNavHealthFilter] = useState<'ALL' | 'PRUDENT_ONLY' | 'EXCLUDE_HIGH_EROSION'>('ALL');
  const [frequencyFilter, setFrequencyFilter] = useState<'ALL' | 'Monthly' | 'Quarterly'>('ALL');
  const [sortBy, setSortBy] = useState<keyof ETFData>('aum');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showFilters, setShowFilters] = useState(false);

  // Filter & Search Logic
  const filteredETFs = useMemo(() => {
    return etfs.filter((etf) => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesSymbol = etf.symbol.toLowerCase().includes(query);
        const matchesName = etf.name.toLowerCase().includes(query);
        const matchesIssuer = etf.issuer.toLowerCase().includes(query);
        const matchesHolding = etf.topHoldings?.some((h) =>
          h.symbol.toLowerCase().includes(query) || h.name.toLowerCase().includes(query)
        );
        if (!matchesSymbol && !matchesName && !matchesIssuer && !matchesHolding) {
          return false;
        }
      }

      // Category
      if (selectedCategory !== 'ALL' && etf.category !== selectedCategory) {
        return false;
      }

      // Yield
      if (etf.dividendYield < minYield) {
        return false;
      }

      // Expense Ratio
      if (etf.expenseRatio > maxExpenseRatio) {
        return false;
      }

      // NAV Health
      if (navHealthFilter === 'PRUDENT_ONLY' && etf.navHealth !== 'Prudent / Minimal Erosion') {
        return false;
      }
      if (navHealthFilter === 'EXCLUDE_HIGH_EROSION' && etf.navHealth === 'High Erosion Warning') {
        return false;
      }

      // Frequency
      if (frequencyFilter !== 'ALL' && etf.distributionFrequency !== frequencyFilter) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      let aVal = a[sortBy] ?? 0;
      let bVal = b[sortBy] ?? 0;
      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortDirection === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
  }, [etfs, searchQuery, selectedCategory, minYield, maxExpenseRatio, navHealthFilter, frequencyFilter, sortBy, sortDirection]);

  const handleSort = (field: keyof ETFData) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const categories: { key: ETFStrategyType | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'All Funds' },
    { key: 'broad_index', label: 'Broad Index Core' },
    { key: 'dividend_growth', label: 'Dividend Growth' },
    { key: 'covered_call', label: 'Covered Call / Income' },
    { key: 'thematic_tech', label: 'Thematic / Tech' },
    { key: 'fixed_income', label: 'Treasury / Cash' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Description */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white">ETF Intelligence & Screener</h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {filteredETFs.length} Funds Found
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Research dividends, ex-dates, expense drag, NAV erosion risks, underlying holdings, and long-term total return.
          </p>
        </div>

        {/* Compare Toolbar */}
        <div className="flex items-center gap-3">
          {selectedForCompare.length > 0 && (
            <button
              onClick={onOpenCompare}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20 animate-pulse"
            >
              <span>Compare Selected ({selectedForCompare.length})</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs transition ${
                viewMode === 'table' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded text-xs transition ${
                viewMode === 'cards' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <IllustrativeDataNotice detail="This legacy screener is backed by the bundled demonstration dataset. Prices, yields, holdings, NAV-health scores, and performance are not current provider quotes; use the Live ETF Research tab for sourced data." />

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap font-medium transition-all ${
              selectedCategory === cat.key
                ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400/50'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search ticker, name, issuer, or holding (e.g. MSFT, Vanguard, Apple)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 placeholder:text-slate-500"
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
              showFilters || minYield > 0 || maxExpenseRatio < 1 || navHealthFilter !== 'ALL' || frequencyFilter !== 'ALL'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Multi-Filter Controls</span>
            {(minYield > 0 || maxExpenseRatio < 1 || navHealthFilter !== 'ALL' || frequencyFilter !== 'ALL') && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </button>
        </div>

        {/* Collapsible Advanced Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80 text-xs">
            {/* Min Yield Filter */}
            <div>
              <div className="flex justify-between items-center text-slate-400 mb-1.5">
                <span>Min Dividend Yield</span>
                <span className="font-mono font-bold text-emerald-400">{minYield}%+</span>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={minYield}
                onChange={(e) => setMinYield(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>0%</span>
                <span>4%</span>
                <span>8%</span>
                <span>12%+</span>
              </div>
            </div>

            {/* Max Expense Ratio */}
            <div>
              <div className="flex justify-between items-center text-slate-400 mb-1.5">
                <span>Max Expense Ratio</span>
                <span className="font-mono font-bold text-slate-200">{maxExpenseRatio.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min="0.03"
                max="1.0"
                step="0.05"
                value={maxExpenseRatio}
                onChange={(e) => setMaxExpenseRatio(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>0.03% (VOO)</span>
                <span>0.35% (JEPI)</span>
                <span>1.0% (TSLY)</span>
              </div>
            </div>

            {/* NAV Health Filter */}
            <div>
              <span className="text-slate-400 block mb-1.5">NAV Erosion Health</span>
              <select
                value={navHealthFilter}
                onChange={(e) => setNavHealthFilter(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Show All Funds</option>
                <option value="PRUDENT_ONLY">Prudent / Minimal Erosion Only (90+)</option>
                <option value="EXCLUDE_HIGH_EROSION">Exclude High Decay Traps</option>
              </select>
            </div>

            {/* Frequency Filter */}
            <div>
              <span className="text-slate-400 block mb-1.5">Payout Frequency</span>
              <select
                value={frequencyFilter}
                onChange={(e) => setFrequencyFilter(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg p-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">All Frequencies</option>
                <option value="Monthly">Monthly Payouts (JEPI, DIVO, QYLD)</option>
                <option value="Quarterly">Quarterly Payouts (VOO, SCHD, VIG)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Screen Mode: Table */}
      {viewMode === 'table' ? (
        <div className="overflow-x-auto bg-slate-900/90 border border-slate-800 rounded-xl shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800 select-none">
              <tr>
                <th className="py-3 px-3 text-center w-12">Comp</th>
                <th
                  onClick={() => handleSort('symbol')}
                  className="py-3 px-3 cursor-pointer hover:text-emerald-400"
                >
                  <div className="flex items-center gap-1">
                    <span>Ticker</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('price')}
                  className="py-3 px-3 cursor-pointer hover:text-emerald-400 text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Price</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dividendYield')}
                  className="py-3 px-3 cursor-pointer hover:text-emerald-400 text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Div Yield</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3">Ex-Div Date</th>
                <th
                  onClick={() => handleSort('fiveYearDivGrowth')}
                  className="py-3 px-3 cursor-pointer hover:text-emerald-400 text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>5Y Div CAGR</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('expenseRatio')}
                  className="py-3 px-3 cursor-pointer hover:text-emerald-400 text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Expense</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('navErosionScore')}
                  className="py-3 px-3 cursor-pointer hover:text-emerald-400 text-center"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>NAV Health</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Strategy Type</th>
                <th className="py-3 px-3 text-center">Rating</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {filteredETFs.map((etf) => {
                const isCompared = selectedForCompare.includes(etf.symbol);
                return (
                  <tr
                    key={etf.symbol}
                    className="hover:bg-slate-800/60 transition group cursor-pointer"
                    onClick={() => onSelectETF(etf)}
                  >
                    {/* Compare Checkbox */}
                    <td
                      className="py-3 px-3 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCompare(etf.symbol);
                      }}
                    >
                      <button
                        className={`w-5 h-5 rounded border flex items-center justify-center transition ${
                          isCompared
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                            : 'border-slate-700 hover:border-slate-500 bg-slate-950'
                        }`}
                      >
                        {isCompared && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    </td>

                    {/* Symbol & Name */}
                    <td className="py-3 px-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-white group-hover:text-emerald-400 text-sm">
                            {etf.symbol}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {etf.distributionFrequency === 'Monthly' ? '📅 Mo' : '📅 Qtr'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-normal line-clamp-1 max-w-[180px]">
                          {etf.name}
                        </span>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-3 px-3 text-right font-mono">
                      <div className="text-slate-100 font-bold">${etf.price.toFixed(2)}</div>
                      <div
                        className={`text-[10px] ${
                          etf.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {etf.change24h >= 0 ? `+${etf.change24h}%` : `${etf.change24h}%`}
                      </div>
                    </td>

                    {/* Dividend Yield */}
                    <td className="py-3 px-3 text-right font-mono">
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          etf.dividendYield > 8
                            ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                            : etf.dividendYield > 3
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'text-slate-300'
                        }`}
                      >
                        {etf.dividendYield.toFixed(2)}%
                      </span>
                    </td>

                    {/* Ex-Div Date */}
                    <td className="py-3 px-3 font-mono text-slate-300">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>{etf.exDividendDate}</span>
                      </div>
                    </td>

                    {/* 5Y Div Growth */}
                    <td className="py-3 px-3 text-right font-mono">
                      <span
                        className={
                          etf.fiveYearDivGrowth > 8
                            ? 'text-emerald-400 font-bold'
                            : etf.fiveYearDivGrowth > 0
                            ? 'text-slate-300'
                            : 'text-rose-400'
                        }
                      >
                        {etf.fiveYearDivGrowth > 0 ? `+${etf.fiveYearDivGrowth}%` : `${etf.fiveYearDivGrowth}%`}
                      </span>
                    </td>

                    {/* Expense Ratio */}
                    <td className="py-3 px-3 text-right font-mono text-slate-300">
                      {etf.expenseRatio.toFixed(2)}%
                    </td>

                    {/* NAV Erosion Health */}
                    <td className="py-3 px-3 text-center">
                      <div className="inline-flex items-center gap-1 font-mono text-xs">
                        {etf.navHealth === 'Prudent / Minimal Erosion' ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                            <ShieldCheck className="w-3 h-3" /> {etf.navErosionScore}/100
                          </span>
                        ) : etf.navHealth === 'Moderate / Yield Offset' ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold">
                            <AlertTriangle className="w-3 h-3" /> {etf.navErosionScore}/100
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold animate-pulse">
                            <ShieldAlert className="w-3 h-3" /> {etf.navErosionScore}/100
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Strategy Label */}
                    <td className="py-3 px-3 text-center">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/80">
                        {etf.categoryLabel.split('/')[0]}
                      </span>
                    </td>

                    {/* Morningstar Stars */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-0.5 text-amber-400">
                        {Array.from({ length: etf.morningstarRating }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-amber-400" />
                        ))}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectETF(etf)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-200 text-xs font-semibold transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredETFs.map((etf) => {
            const isCompared = selectedForCompare.includes(etf.symbol);
            return (
              <div
                key={etf.symbol}
                onClick={() => onSelectETF(etf)}
                className="cursor-pointer bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 transition-all shadow-md group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-xl text-white group-hover:text-emerald-400">
                          {etf.symbol}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {etf.issuer}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{etf.name}</p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCompare(etf.symbol);
                      }}
                      className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition ${
                        isCompared
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {isCompared ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Core Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 my-3.5 py-2.5 px-3 bg-slate-950/70 rounded-lg border border-slate-800/80 font-mono text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Price</span>
                      <span className="font-bold text-slate-100">${etf.price.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Div Yield</span>
                      <span className="font-bold text-emerald-400">{etf.dividendYield}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Expense</span>
                      <span className="font-bold text-slate-200">{etf.expenseRatio}%</span>
                    </div>
                  </div>

                  {/* NAV Health Warning / Safe Status */}
                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between mb-3 ${
                      etf.navHealth === 'Prudent / Minimal Erosion'
                        ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-300'
                        : etf.navHealth === 'Moderate / Yield Offset'
                        ? 'bg-amber-950/20 border-amber-800/30 text-amber-300'
                        : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {etf.navHealth === 'Prudent / Minimal Erosion' ? (
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                      )}
                      <span>NAV Score:</span>
                    </span>
                    <span className="font-bold">{etf.navErosionScore}/100 ({etf.navHealth.split('/')[0]})</span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {etf.strategyDescription}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">Ex-Div: {etf.exDividendDate}</span>
                  <span className="text-emerald-400 font-semibold group-hover:translate-x-1 transition flex items-center gap-1">
                    Inspect Fund →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
