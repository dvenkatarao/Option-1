import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

type MarketItem = { symbol: string; price: number | null; change: number | null; changePct: number | null; marketState: string | null };
type MarketResponse = { items: MarketItem[]; fetchedAt: string | null; stale: boolean; source: string };

const DISPLAY_ITEMS = [
  { symbol: '^GSPC', label: 'S&P 500', index: true },
  { symbol: '^IXIC', label: 'NASDAQ', index: true },
  { symbol: '^VIX', label: 'VIX', index: true },
  { symbol: 'SPY', label: 'SPY', index: false },
  { symbol: 'QQQ', label: 'QQQ', index: false },
  { symbol: 'TLT', label: 'TLT', index: false },
  { symbol: 'SCHD', label: 'SCHD', index: false },
];

export const MarketTickerBar = () => {
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/market', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Market quotes unavailable (${response.status})`);
        const result = await response.json() as MarketResponse;
        if (active) { setMarket(result); setError(false); }
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const quotes = new Map((market?.items ?? []).map((item) => [item.symbol, item]));
  const marketState = market?.items.find((item) => item.marketState)?.marketState;
  const isOpen = marketState?.toUpperCase() === 'REGULAR';

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 text-xs py-2 px-4 overflow-x-auto select-none backdrop-blur-md">
      <div className="flex items-center gap-6 min-w-max">
        <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] pr-2 border-r border-slate-700/60">
          <Activity className={`w-3.5 h-3.5 ${market && !market.stale ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span>US Market Quotes</span>
        </div>

        {DISPLAY_ITEMS.map((display) => {
          const quote = quotes.get(display.symbol);
          const positive = (quote?.change ?? 0) >= 0;
          return (
            <div key={display.symbol} className="flex items-center gap-2">
              <span className="font-mono font-bold text-slate-200" title={display.label}>{display.label}</span>
              <span className="text-slate-400 font-mono">
                {quote?.price == null ? '—' : display.index ? quote.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : `$${quote.price.toFixed(2)}`}
              </span>
              {quote?.changePct != null ? <span className={`flex items-center text-[11px] font-mono font-medium px-1.5 py-0.5 rounded ${positive ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40' : 'text-rose-400 bg-rose-950/60 border border-rose-800/40'}`}>
                {positive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                {quote.changePct > 0 ? '+' : ''}{quote.changePct.toFixed(2)}%
              </span> : <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-600">N/A</span>}
            </div>
          );
        })}

        <div className="ml-auto flex items-center gap-3 pl-4 border-l border-slate-800 text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${marketState ? isOpen ? 'bg-emerald-500' : 'bg-slate-500' : 'bg-amber-400'}`}></span>
            Market: <strong className="text-slate-200 font-normal">{marketState ? isOpen ? 'Open' : 'Closed / extended' : 'Status unavailable'}</strong>
          </span>
          <span className="text-slate-500 text-[10px]">{error ? 'Provider unavailable' : market?.stale ? 'Cached quotes' : market?.fetchedAt ? `As of ${new Date(market.fetchedAt).toLocaleTimeString()}` : 'Loading quotes'}</span>
        </div>
      </div>
      <div className="sr-only">{market?.source ?? 'Delayed quote provider'}{market?.stale ? ' Cached data.' : ''}</div>
    </div>
  );
};
