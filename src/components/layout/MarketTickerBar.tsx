import React from 'react';
import { MARKET_PULSE_ITEMS } from '../../data/marketData';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

export const MarketTickerBar: React.FC = () => {
  return (
    <div className="bg-slate-900/90 border-b border-slate-800 text-xs py-2 px-4 overflow-x-auto select-none backdrop-blur-md">
      <div className="flex items-center gap-6 min-w-max">
        <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] pr-2 border-r border-slate-700/60">
          <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>US Markets Live</span>
        </div>

        {MARKET_PULSE_ITEMS.map((item) => (
          <div key={item.ticker} className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-200">{item.ticker}</span>
            <span className="text-slate-400 font-mono">
              {item.type === 'rate'
                ? `${item.value.toFixed(2)}%`
                : item.type === 'volatility'
                ? item.value.toFixed(2)
                : `$${item.value.toFixed(2)}`}
            </span>
            <span
              className={`flex items-center text-[11px] font-mono font-medium px-1.5 py-0.5 rounded ${
                item.isPositive
                  ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40'
                  : 'text-rose-400 bg-rose-950/60 border border-rose-800/40'
              }`}
            >
              {item.isPositive ? (
                <TrendingUp className="w-3 h-3 mr-0.5" />
              ) : (
                <TrendingDown className="w-3 h-3 mr-0.5" />
              )}
              {item.change > 0 ? `+${item.change}%` : `${item.change}%`}
            </span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-3 pl-4 border-l border-slate-800 text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            NYSE/NASDAQ: <strong className="text-slate-200 font-normal">Open</strong>
          </span>
          <span className="text-slate-500 text-[11px]">Next Fed Meeting: 18d</span>
        </div>
      </div>
    </div>
  );
};
