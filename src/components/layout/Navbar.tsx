import React from 'react';
import {
  BookOpen,
  Compass,
  Layers,
  PieChart,
  RotateCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

export type MainTabType = 'dashboard' | 'etfs' | 'wheel' | 'portfolio' | 'research';

type NavItem = {
  id: MainTabType;
  label: string;
  icon: typeof Compass;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Mission Control', icon: Compass },
  { id: 'etfs', label: 'ETF Intelligence', icon: Layers },
  { id: 'wheel', label: 'Wheel Strategy Lab', icon: RotateCw },
  { id: 'portfolio', label: 'Portfolio Studio', icon: PieChart },
  { id: 'research', label: 'Research Academy', icon: BookOpen },
];

interface NavbarProps {
  activeTab: MainTabType;
  setActiveTab: (tab: MainTabType) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onOpenMacro?: () => void;
  openCompareModal?: () => void;
  selectedCompareCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  onOpenMacro,
  selectedCompareCount = 0,
}) => {
  const macroClick = onOpenMacro ?? (() => setActiveTab('research'));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Brand and quick actions share one predictable-height row. */}
        <div className="flex h-14 items-center justify-between gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            aria-label="Go to Mission Control"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/40">
              <RotateCw className="h-5 w-5 stroke-[2.5] text-slate-950" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
                  WheelCore
                </span>
                <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase leading-none text-emerald-400">
                  v2.5 PRO
                </span>
              </span>
              <span className="mt-0.5 hidden truncate text-[10px] leading-tight text-slate-400 sm:block">
                US ETF &amp; Options Wheel Intelligence Terminal
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <label className="relative hidden w-48 shrink-0 lg:block xl:w-64">
              <span className="sr-only">Search ETFs and Wheel stocks</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ETF / Wheel Stock..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-9 w-full rounded-lg border border-slate-800 bg-slate-900/90 pl-9 pr-8 text-xs text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>

            <button
              type="button"
              onClick={macroClick}
              aria-label="Open live macro signals"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/30 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 sm:px-3"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <span className="hidden sm:inline">Macro signals</span>
              <span className="sm:hidden">Macro</span>
            </button>
          </div>
        </div>

        {/* A dedicated nav row prevents the long menu labels from squeezing the brand or actions. */}
        <nav
          aria-label="Primary navigation"
          className="flex min-w-0 items-center gap-1 overflow-x-auto border-t border-slate-800/70 py-1.5"
        >
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:px-3.5 ${
                activeTab === id
                  ? 'bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
              {id === 'etfs' && selectedCompareCount > 0 && (
                <span className="rounded-full bg-emerald-400 px-1.5 py-0.5 font-mono text-[9px] font-bold leading-none text-slate-950">
                  {selectedCompareCount}
                </span>
              )}
              {id === 'wheel' && (
                <span className="relative flex h-2 w-2 shrink-0" aria-label="Wheel scanner active">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};
