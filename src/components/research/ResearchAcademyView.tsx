import React, { useState } from 'react';
import { EDUCATIONAL_GUIDES } from '../../data/marketData';
import { ETFData, WheelStock } from '../../types';
import {
  BookOpen,
  RotateCw,
  Calendar,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface ResearchAcademyViewProps {
  etfs: ETFData[];
  wheelStocks: WheelStock[];
  onSelectETF: (etf: ETFData) => void;
  onSelectWheelStock: (stock: WheelStock) => void;
}

export const ResearchAcademyView: React.FC<ResearchAcademyViewProps> = ({
  etfs,
  wheelStocks,
  onSelectETF,
  onSelectWheelStock,
}) => {
  const [selectedGuideId, setSelectedGuideId] = useState<string>(EDUCATIONAL_GUIDES[0].id);
  const activeGuide =
    EDUCATIONAL_GUIDES.find((g) => g.id === selectedGuideId) || EDUCATIONAL_GUIDES[0];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-emerald-400" />
          <h1 className="text-2xl font-extrabold text-white">Research & Strategy Academy</h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Master the mechanics of Options Wheel risk management, Delta strike selection, and ETF NAV erosion anatomy.
        </p>
      </div>

      {/* Guide Tabs Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {EDUCATIONAL_GUIDES.map((guide) => {
          const isSelected = guide.id === selectedGuideId;
          return (
            <div
              key={guide.id}
              onClick={() => setSelectedGuideId(guide.id)}
              className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-900 border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-400/40'
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {guide.category}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">{guide.readTime}</span>
                </div>
                <h3 className="text-sm font-bold text-white mt-1 leading-snug">{guide.title}</h3>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                  {guide.summary}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>{isSelected ? 'Currently Reading' : 'Read Playbook'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Guide Reader Modal/Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider block mb-1">
              {activeGuide.category} • {activeGuide.readTime}
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">{activeGuide.title}</h2>
          </div>
        </div>

        {/* Key Takeaways Box */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Executive Takeaways & Operating Rules
          </h3>
          <ul className="space-y-2 text-xs sm:text-sm text-slate-300">
            {activeGuide.keyTakeaways.map((takeaway, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{takeaway}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Content Body */}
        <div className="text-xs sm:text-sm text-slate-300 space-y-4 leading-relaxed font-sans whitespace-pre-line bg-slate-950/40 p-5 rounded-xl border border-slate-800/80">
          {activeGuide.content}
        </div>
      </div>

      {/* Greeks Reference Matrix */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <RotateCw className="w-5 h-5 text-emerald-400" />
          The Options Wheel Greeks Cheat Sheet
        </h3>
        <p className="text-xs text-slate-400">
          How to read Greeks specifically when executing Cash-Secured Puts and Covered Calls.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <span className="text-emerald-400 font-extrabold text-sm block">Delta (Δ) — Win Rate</span>
            <p className="text-slate-300 font-sans text-xs">
              Represents probability of expiring In-The-Money. For Wheel puts, aim for <strong>0.18 - 0.25 Delta</strong> (approx 80% Win Rate / OTM probability).
            </p>
          </div>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <span className="text-cyan-300 font-extrabold text-sm block">Theta (θ) — Daily Cash Flow</span>
            <p className="text-slate-300 font-sans text-xs">
              Daily dollar decay. Theta accelerates most between <strong>30 to 45 DTE</strong>, allowing fast 50% profit target exits without gamma risk.
            </p>
          </div>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <span className="text-amber-400 font-extrabold text-sm block">IV Rank — Premium Richness</span>
            <p className="text-slate-300 font-sans text-xs">
              Measures volatility vs past year. Target <strong>IV Rank 30% - 60%</strong> for rich option premiums with stable underlying fundamentals.
            </p>
          </div>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
            <span className="text-purple-400 font-extrabold text-sm block">Gamma (Γ) — Tail Risk</span>
            <p className="text-slate-300 font-sans text-xs">
              Rate of Delta change. Avoid selling options with <strong>&lt; 7 DTE</strong> where gamma spikes can cause violent rapid losses.
            </p>
          </div>
        </div>
      </div>

      {/* Earnings & Ex-Dividend Risk Radar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Earnings & Ex-Dividend Event Radar</h3>
          </div>
          <span className="text-xs font-mono font-bold text-slate-400">
            Rule: Avoid selling Puts directly across earnings releases
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Upcoming Earnings Radar */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider mb-3">
              Wheel Stock Earnings Dates
            </h4>
            <div className="space-y-2 font-mono text-xs">
              {wheelStocks.slice(0, 5).map((stock) => (
                <div
                  key={stock.symbol}
                  onClick={() => onSelectWheelStock(stock)}
                  className="cursor-pointer hover:bg-slate-900 p-2 rounded-lg flex items-center justify-between border border-slate-850 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{stock.symbol}</span>
                    <span className="text-[11px] text-slate-400 font-sans">{stock.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">{stock.earningsDate}</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                      {stock.daysToEarnings}d
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming ETF Ex-Dividend Dates */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider mb-3">
              ETF Ex-Dividend Countdown
            </h4>
            <div className="space-y-2 font-mono text-xs">
              {etfs.slice(0, 5).map((etf) => (
                <div
                  key={etf.symbol}
                  onClick={() => onSelectETF(etf)}
                  className="cursor-pointer hover:bg-slate-900 p-2 rounded-lg flex items-center justify-between border border-slate-850 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-400">{etf.symbol}</span>
                    <span className="text-[11px] text-slate-400 font-sans">{etf.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">{etf.exDividendDate}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                      {etf.distributionFrequency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
