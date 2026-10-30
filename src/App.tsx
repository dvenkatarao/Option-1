"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import { MainTabType, Navbar } from './components/layout/Navbar';
import { MarketTickerBar } from './components/layout/MarketTickerBar';
import { DashboardView } from './components/dashboard/DashboardView';
import { ETFScreenerView } from './components/etf/ETFScreenerView';
import { ETFDetailModal } from './components/etf/ETFDetailModal';
import { ETFCompareView } from './components/etf/ETFCompareView';
import { WheelScannerView } from './components/wheel/WheelScannerView';
import { WheelOptionChainModal } from './components/wheel/WheelOptionChainModal';
import { WheelSimulatorView } from './components/wheel/WheelSimulatorView';
import { WheelTrackerView } from './components/wheel/WheelTrackerView';
import { PortfolioStudioView } from './components/portfolio/PortfolioStudioView';
import { PersistentPortfolioView } from './components/portfolio/PersistentPortfolioView';
import { ResearchAcademyView } from './components/research/ResearchAcademyView';
import { LiveResearchHub } from './components/live/LiveResearchHub';
import { LiveEtfScreenerView } from './components/live/LiveEtfScreenerView';
import { LiveWheelView } from './components/live/LiveWheelView';
import { LiveStockSearchPreview } from './components/live/LiveStockSearchPreview';
import type { LiveStockSearchProfile } from './lib/live-stock-search';
import { ETF_DATASET } from './data/etfData';
import { IllustrativeDataNotice } from './components/common/IllustrativeDataNotice';
import { WHEEL_STOCKS, ACTIVE_CAMPAIGNS } from './data/wheelData';
import { ETFData, WheelStock, OptionContract, ActiveWheelCampaign } from './types';
import { RefreshCw, Zap } from 'lucide-react';

const SAMPLE_ETF_SCREENS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SAMPLE_ETF_SCREENS === 'true';

type GlobalStockSearchResponse = {
  query: string;
  profiles: LiveStockSearchProfile[];
  tickerLookup: { ticker: string; canHydrate: boolean } | null;
};
type SelectedLiveStock = { ticker: string; canHydrate: boolean };

export function App() {
  const [activeTab, setActiveTab] = useState<MainTabType>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // Datasets
  const [etfs] = useState<ETFData[]>(ETF_DATASET);
  const [wheelStocks] = useState<WheelStock[]>(WHEEL_STOCKS);
  const [activeCampaigns, setActiveCampaigns] = useState<ActiveWheelCampaign[]>(ACTIVE_CAMPAIGNS);

  // Modals & Sub-views
  const [selectedETF, setSelectedETF] = useState<ETFData | null>(null);
  const [selectedStockForChain, setSelectedStockForChain] = useState<WheelStock | null>(null);
  const [selectedLiveStock, setSelectedLiveStock] = useState<SelectedLiveStock | null>(null);
  const [requestedLiveDetailTicker, setRequestedLiveDetailTicker] = useState<string | null>(null);
  const [liveStockSearch, setLiveStockSearch] = useState<GlobalStockSearchResponse>({ query: '', profiles: [], tickerLookup: null });
  const [liveStockSearchLoading, setLiveStockSearchLoading] = useState(false);
  const [liveStockSearchError, setLiveStockSearchError] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>(
    SAMPLE_ETF_SCREENS_ENABLED ? ['VOO', 'SCHD', 'JEPI'] : [],
  );
  const [isCompareViewOpen, setIsCompareViewOpen] = useState(false);

  // With sample ETF screens disabled, enter the ETF workstation directly on live research.
  const [showLiveEtfScreener, setShowLiveEtfScreener] = useState(!SAMPLE_ETF_SCREENS_ENABLED);
  const [portfolioView, setPortfolioView] = useState<'studio' | 'accounts'>('studio');
  const [researchView, setResearchView] = useState<'academy' | 'live'>('academy');

  // Wheel sub-tab
  const [wheelSubTab, setWheelSubTab] = useState<'scanner' | 'simulator' | 'tracker' | 'live'>('scanner');
  const [simulatorInitialStock, setSimulatorInitialStock] = useState<WheelStock | undefined>(undefined);
  const [simulatorInitialOption, setSimulatorInitialOption] = useState<OptionContract | undefined>(undefined);

  // Toggle compare item
  const handleToggleCompare = (symbol: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(symbol)) {
        return prev.filter((s) => s !== symbol);
      }
      if (prev.length >= 3) {
        return [prev[1], prev[2], symbol];
      }
      return [...prev, symbol];
    });
  };

  // Launch Simulator with specific stock & option
  const handleSelectStockForSimulator = (stock: WheelStock, option?: OptionContract) => {
    setSimulatorInitialStock(stock);
    setSimulatorInitialOption(option);
    setActiveTab('wheel');
    setWheelSubTab('simulator');
    if (selectedStockForChain) {
      setSelectedStockForChain(null);
    }
  };

  // Add new campaign
  const handleAddCampaign = (camp: ActiveWheelCampaign) => {
    setActiveCampaigns((prev) => [camp, ...prev]);
  };

  // Global stock search uses hydrated provider-backed profiles, never the bundled WheelStock demo data.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLiveStockSearch({ query, profiles: [], tickerLookup: null });
      setLiveStockSearchLoading(true);
      setLiveStockSearchError(null);
      void (async () => {
        try {
          const response = await fetch(`/api/wheel/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Live stock search failed (${response.status})`);
          if (!controller.signal.aborted) setLiveStockSearch(body as GlobalStockSearchResponse);
        } catch (reason) {
          if (!controller.signal.aborted) setLiveStockSearchError(reason instanceof Error ? reason.message : "Live stock search is unavailable");
        } finally {
          if (!controller.signal.aborted) setLiveStockSearchLoading(false);
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // ETF global results remain separate from the live stock profile search.
  const globalSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return {
      etfs: etfs.filter((e) =>
        e.symbol.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.issuer.toLowerCase().includes(q),
      ),
    };
  }, [searchQuery, etfs]);

  const liveStockSearchIsCurrent = liveStockSearch.query === searchQuery.trim();

  const openLiveStockPreview = (ticker: string, canHydrate: boolean) => {
    setSelectedLiveStock({ ticker, canHydrate });
    setSearchQuery('');
  };

  const acknowledgeLiveDetailOpen = useCallback(() => setRequestedLiveDetailTicker(null), []);

  const openLiveDetailWorkspace = (ticker: string) => {
    setSelectedLiveStock(null);
    setSearchQuery('');
    setActiveTab('wheel');
    setWheelSubTab('live');
    setIsCompareViewOpen(false);
    setRequestedLiveDetailTicker(ticker);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Real-time US Market Ticker Bar */}
      <MarketTickerBar />

      {/* Primary Navigation Workstation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsCompareViewOpen(false);
        }}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onOpenMacro={() => {
          setActiveTab('research');
          setResearchView('live');
          setIsCompareViewOpen(false);
        }}
        selectedCompareCount={SAMPLE_ETF_SCREENS_ENABLED ? selectedForCompare.length : 0}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Global search: ETF examples remain labeled; stock matches come from provider-backed profiles. */}
        {searchQuery.trim() && (
          <div role="region" aria-label="Global search results" className="mb-6 rounded-2xl border border-emerald-500/50 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-emerald-400">Search Results for &quot;{searchQuery}&quot;</span>
              <button type="button" onClick={() => setSearchQuery('')} className="text-xs text-slate-400 hover:text-white">Clear Search ✕</button>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-mono font-semibold text-slate-300">ETF matches ({globalSearchResults?.etfs.length ?? 0})</h2>
                </div>
                {(globalSearchResults?.etfs.length ?? 0) > 0 && (
                  <IllustrativeDataNotice detail="These global ETF matches use bundled example profiles and are not current quotes or recommendations. Use Live ETF Research for provider-backed ETF data." className="mb-3" />
                )}
                <div className="space-y-1.5">
                  {globalSearchResults?.etfs.slice(0, 4).map((etf) => (
                    <button
                      type="button"
                      key={etf.symbol}
                      onClick={() => { setSelectedETF(etf); setSearchQuery(''); }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg bg-slate-950 p-2.5 text-left text-xs transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      <span className="shrink-0 font-mono font-bold text-white">{etf.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-400">{etf.name}</span>
                      <span className="shrink-0 font-mono text-emerald-400">{etf.dividendYield}% yield</span>
                    </button>
                  ))}
                  {(globalSearchResults?.etfs.length ?? 0) === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-3 text-xs text-slate-500">No ETF matches.</p>}
                </div>
              </section>

              <section>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-mono font-semibold text-slate-300">Live stock profiles ({liveStockSearchIsCurrent ? liveStockSearch.profiles.length + (liveStockSearch.tickerLookup ? 1 : 0) : 0})</h2>
                </div>
                <p className="mb-3 text-[10px] leading-relaxed text-slate-500">Company-name matches come from hydrated provider-backed stock records. Opening a result loads quote data with source and freshness details.</p>
                {liveStockSearchLoading || !liveStockSearchIsCurrent ? (
                  <p className="inline-flex items-center gap-2 rounded-lg border border-slate-800 p-3 text-xs text-slate-400"><RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-300" />Searching live stock profiles…</p>
                ) : liveStockSearchError ? (
                  <p role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-100">Live stock search unavailable: {liveStockSearchError}. No demo stock data is substituted.</p>
                ) : (
                  <div className="space-y-1.5">
                    {liveStockSearch.profiles.map((profile) => (
                      <button
                        type="button"
                        key={profile.ticker}
                        onClick={() => openLiveStockPreview(profile.ticker, false)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg bg-slate-950 p-2.5 text-left text-xs transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                      >
                        <span className="shrink-0 font-mono font-bold text-white">{profile.ticker}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-300">{profile.name ?? "Company name unavailable"}<span className="ml-2 text-[10px] text-slate-500">{profile.sector ?? "Sector unavailable"}</span></span>
                        <span className={`shrink-0 text-right text-[10px] ${profile.lastError ? "text-amber-300" : "text-slate-500"}`}>{profile.refreshedAt ? `${profile.lastError ? "Refresh failed" : "Profile refreshed"} ${new Date(profile.refreshedAt).toLocaleDateString()}` : "Profile date unavailable"}</span>
                      </button>
                    ))}
                    {liveStockSearch.tickerLookup && (
                      <button
                        type="button"
                        onClick={() => openLiveStockPreview(liveStockSearch.tickerLookup!.ticker, true)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2.5 text-left text-xs transition hover:bg-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                      >
                        <span className="shrink-0 font-mono font-bold text-cyan-200">{liveStockSearch.tickerLookup.ticker}</span>
                        <span className="min-w-0 flex-1 text-slate-300">Ticker in configured live wheel universe<span className="ml-2 text-[10px] text-slate-500">Profile not hydrated yet</span></span>
                        <span className="shrink-0 text-[10px] font-semibold text-cyan-200">Fetch profile</span>
                      </button>
                    )}
                    {liveStockSearch.profiles.length === 0 && !liveStockSearch.tickerLookup && (
                      <p className="rounded-lg border border-dashed border-slate-800 p-3 text-xs leading-relaxed text-slate-500">{searchQuery.trim().length < 2 ? "No exact live ticker match. Enter at least two characters to search company names." : "No live stock profile matched. Search a hydrated company name or a ticker in the configured wheel universe."}</p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* WORKSTATION 1: Dashboard / Mission Control */}
        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigate={(tab) => {
              setActiveTab(tab);
              setIsCompareViewOpen(false);
            }}
            onViewAllWheelOpportunities={() => {
              setActiveTab('wheel');
              setWheelSubTab('live');
            }}
            onOpenLiveEtfResearch={() => {
              setActiveTab('etfs');
              setShowLiveEtfScreener(true);
              setIsCompareViewOpen(false);
            }}
            onOpenLiveWheelJournal={() => {
              setActiveTab('wheel');
              setWheelSubTab('live');
            }}
          />
        )}

        {/* WORKSTATION 2: ETF Intelligence Screener & Compare */}
        {activeTab === 'etfs' && (
          <div className="space-y-6">
            {/* Keep the original workstation views and add provider-backed research alongside them. */}
            <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-3">
              {SAMPLE_ETF_SCREENS_ENABLED && (
                <button
                  onClick={() => { setShowLiveEtfScreener(false); setIsCompareViewOpen(false); }}
                  className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                    !showLiveEtfScreener && !isCompareViewOpen
                      ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ETF Screener & Multi-Filter Table
                </button>
              )}

              <button
                onClick={() => { setShowLiveEtfScreener(true); setIsCompareViewOpen(false); }}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  showLiveEtfScreener && !isCompareViewOpen
                    ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Live ETF Research
              </button>

              {SAMPLE_ETF_SCREENS_ENABLED && (
                <button
                  onClick={() => setIsCompareViewOpen(true)}
                  className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                    isCompareViewOpen
                      ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Head-to-Head Comparison</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-slate-200">
                    {selectedForCompare.length}
                  </span>
                </button>
              )}
            </div>

            {SAMPLE_ETF_SCREENS_ENABLED && isCompareViewOpen ? (
              <ETFCompareView
                allETFs={etfs}
                selectedSymbols={selectedForCompare}
                onToggleCompare={handleToggleCompare}
                onSelectETF={(etf) => setSelectedETF(etf)}
              />
            ) : SAMPLE_ETF_SCREENS_ENABLED && !showLiveEtfScreener ? (
              <ETFScreenerView
                etfs={etfs}
                onSelectETF={(etf) => setSelectedETF(etf)}
                selectedForCompare={selectedForCompare}
                onToggleCompare={handleToggleCompare}
                onOpenCompare={() => setIsCompareViewOpen(true)}
              />
            ) : (
              <LiveEtfScreenerView />
            )}
          </div>
        )}

        {/* WORKSTATION 3: Options Wheel Strategy Command Center */}
        {activeTab === 'wheel' && (
          <div className="space-y-6">
            {/* Sub-tabs: Scanner vs Simulator vs Position Tracker */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
              <button
                onClick={() => setWheelSubTab('scanner')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  wheelSubTab === 'scanner'
                    ? 'bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                1. Wheel Opportunity Scanner
              </button>

              <button
                onClick={() => setWheelSubTab('simulator')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  wheelSubTab === 'simulator'
                    ? 'bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>2. Interactive Wheel Cycle Simulator</span>
              </button>

              <button
                onClick={() => setWheelSubTab('tracker')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                  wheelSubTab === 'tracker'
                    ? 'bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>3. Active Positions & Roll Journal</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-slate-200">
                  {activeCampaigns.length}
                </span>
              </button>

              <button
                onClick={() => setWheelSubTab('live')}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  wheelSubTab === 'live'
                    ? 'bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                4. Live Provider Scanner & Journal
              </button>
            </div>

            {wheelSubTab === 'scanner' && (
              <WheelScannerView
                stocks={wheelStocks}
                onSelectStockForChain={(stock) => setSelectedStockForChain(stock)}
                onSelectStockForSimulator={handleSelectStockForSimulator}
                onOpenNewCampaign={(stock) => handleSelectStockForSimulator(stock)}
              />
            )}

            {wheelSubTab === 'simulator' && (
              <WheelSimulatorView
                stocks={wheelStocks}
                initialStock={simulatorInitialStock}
                initialOption={simulatorInitialOption}
              />
            )}

            {wheelSubTab === 'tracker' && (
              <WheelTrackerView
                campaigns={activeCampaigns}
                stocks={wheelStocks}
                onAddCampaign={handleAddCampaign}
                onNavigateToScanner={() => setWheelSubTab('scanner')}
              />
            )}

            {wheelSubTab === 'live' && (
              <LiveWheelView
                initialDetailTicker={requestedLiveDetailTicker}
                onInitialDetailTickerOpened={acknowledgeLiveDetailOpen}
              />
            )}
          </div>
        )}

        {/* WORKSTATION 4: Preserve the original educational simulator and add the database-backed ledger. */}
        {activeTab === 'portfolio' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-3">
              <button onClick={() => setPortfolioView('studio')} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${portfolioView === 'studio' ? 'bg-emerald-600 font-bold text-white shadow-md shadow-emerald-600/30' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Portfolio Studio · Simulator</button>
              <button onClick={() => setPortfolioView('accounts')} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${portfolioView === 'accounts' ? 'bg-emerald-600 font-bold text-white shadow-md shadow-emerald-600/30' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Persistent Accounts & Ledger</button>
            </div>
            {portfolioView === 'studio' ? (
              <PortfolioStudioView
                etfs={etfs}
                wheelStocks={wheelStocks}
                onSelectETF={(etf) => setSelectedETF(etf)}
                onSelectWheelStock={(stock) => handleSelectStockForSimulator(stock)}
              />
            ) : <PersistentPortfolioView />}
          </div>
        )}

        {/* WORKSTATION 5: Keep the learning academy; live feeds and data-driven research are additive. */}
        {activeTab === 'research' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-3">
              <button onClick={() => setResearchView('academy')} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${researchView === 'academy' ? 'bg-emerald-600 font-bold text-white shadow-md shadow-emerald-600/30' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Research Academy · Learning</button>
              <button onClick={() => setResearchView('live')} className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${researchView === 'live' ? 'bg-emerald-600 font-bold text-white shadow-md shadow-emerald-600/30' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Live Research & Sources</button>
            </div>
            {researchView === 'academy' ? (
              <ResearchAcademyView
                etfs={etfs}
                wheelStocks={wheelStocks}
                onSelectETF={(etf) => setSelectedETF(etf)}
                onSelectWheelStock={(stock) => handleSelectStockForSimulator(stock)}
              />
            ) : <LiveResearchHub />}
          </div>
        )}
      </main>

      {/* ETF Detail Dossier Modal */}
      {selectedETF && (
        <ETFDetailModal
          etf={selectedETF}
          onClose={() => setSelectedETF(null)}
          onAddToCompare={handleToggleCompare}
          isCompared={selectedForCompare.includes(selectedETF.symbol)}
          showCompareActions={SAMPLE_ETF_SCREENS_ENABLED}
          onOpenCompare={() => {
            if (!SAMPLE_ETF_SCREENS_ENABLED) return;
            setSelectedETF(null);
            setActiveTab('etfs');
            setShowLiveEtfScreener(false);
            setIsCompareViewOpen(true);
          }}
        />
      )}

      {selectedLiveStock && (
        <LiveStockSearchPreview
          key={selectedLiveStock.ticker}
          ticker={selectedLiveStock.ticker}
          canHydrate={selectedLiveStock.canHydrate}
          onClose={() => setSelectedLiveStock(null)}
          onOpenDetail={openLiveDetailWorkspace}
        />
      )}

      {/* Sample-only Wheel Options Chain Matrix Modal remains available in the legacy sample scanner. */}
      {selectedStockForChain && (
        <WheelOptionChainModal
          stock={selectedStockForChain}
          onClose={() => setSelectedStockForChain(null)}
          onSelectOptionForSim={handleSelectStockForSimulator}
        />
      )}

      {/* Footer */}
      <footer className="mt-16 bg-slate-950 border-t border-slate-900 py-8 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center">
              W
            </div>
            <span className="font-bold text-slate-300">WheelCore Intelligence Terminal</span>
            <span className="text-slate-500">|</span>
            <span>US Markets ETF & Options Wheel Portfolio Builder</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-400">Data: Provider feeds + clearly labeled demos</span>
            <span>•</span>
            <span className="text-slate-400">Persistent portfolio & trade journals</span>
            <span>•</span>
            <span className="text-slate-400">Options wheel research tools</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-4 pt-4 border-t border-slate-900 text-[10px] text-slate-500 text-center leading-relaxed">
          Disclaimer: WheelCore is an educational portfolio research and screening interface. Options trading and leveraged exchange-traded products carry significant financial risk. Always verify liquidity, ex-dividend dates, and NAV erosion risk profiles prior to executing real-money capital allocations.
        </div>
      </footer>
    </div>
  );
}

export default App;
