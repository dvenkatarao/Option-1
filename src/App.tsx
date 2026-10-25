import { useState, useMemo } from 'react';
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
import { ResearchAcademyView } from './components/research/ResearchAcademyView';
import { ETF_DATASET } from './data/etfData';
import { WHEEL_STOCKS, ACTIVE_CAMPAIGNS } from './data/wheelData';
import { ETFData, WheelStock, OptionContract, ActiveWheelCampaign } from './types';
import { Zap } from 'lucide-react';

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
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>(['VOO', 'SCHD', 'JEPI']);
  const [isCompareViewOpen, setIsCompareViewOpen] = useState(false);

  // Wheel sub-tab
  const [wheelSubTab, setWheelSubTab] = useState<'scanner' | 'simulator' | 'tracker'>('scanner');
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

  // Global Search results if user searches in top bar
  const globalSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const matchedETFs = etfs.filter(
      (e) =>
        e.symbol.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.issuer.toLowerCase().includes(q)
    );
    const matchedStocks = wheelStocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q)
    );
    return { etfs: matchedETFs, stocks: matchedStocks };
  }, [searchQuery, etfs, wheelStocks]);

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
        selectedCompareCount={selectedForCompare.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Global Search Overlay Dropdown if query entered */}
        {globalSearchResults && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-900 border border-emerald-500/50 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-mono font-bold text-emerald-400">
                Search Results for "{searchQuery}"
              </span>
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear Search ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* ETFs Matched */}
              <div>
                <span className="text-[11px] font-mono text-slate-400 block mb-1">
                  ETFs ({globalSearchResults.etfs.length})
                </span>
                <div className="space-y-1">
                  {globalSearchResults.etfs.slice(0, 4).map((e) => (
                    <div
                      key={e.symbol}
                      onClick={() => {
                        setSelectedETF(e);
                        setSearchQuery('');
                      }}
                      className="cursor-pointer p-2 rounded-lg bg-slate-950 hover:bg-slate-800 flex items-center justify-between text-xs font-mono transition"
                    >
                      <span className="font-bold text-white">{e.symbol}</span>
                      <span className="text-slate-400 font-sans truncate max-w-[140px]">{e.name}</span>
                      <span className="text-emerald-400 font-bold">{e.dividendYield}% Yield</span>
                    </div>
                  ))}
                  {globalSearchResults.etfs.length === 0 && (
                    <span className="text-xs text-slate-500">No ETFs found</span>
                  )}
                </div>
              </div>

              {/* Wheel Stocks Matched */}
              <div>
                <span className="text-[11px] font-mono text-slate-400 block mb-1">
                  Wheel Blue-Chips ({globalSearchResults.stocks.length})
                </span>
                <div className="space-y-1">
                  {globalSearchResults.stocks.slice(0, 4).map((s) => (
                    <div
                      key={s.symbol}
                      onClick={() => {
                        setSelectedStockForChain(s);
                        setSearchQuery('');
                      }}
                      className="cursor-pointer p-2 rounded-lg bg-slate-950 hover:bg-slate-800 flex items-center justify-between text-xs font-mono transition"
                    >
                      <span className="font-bold text-white">{s.symbol}</span>
                      <span className="text-slate-400 font-sans truncate max-w-[140px]">{s.name}</span>
                      <span className="text-cyan-300 font-bold">Score {s.wheelSuitabilityScore}</span>
                    </div>
                  ))}
                  {globalSearchResults.stocks.length === 0 && (
                    <span className="text-xs text-slate-500">No blue-chip stocks found</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WORKSTATION 1: Dashboard / Mission Control */}
        {activeTab === 'dashboard' && (
          <DashboardView
            etfs={etfs}
            wheelStocks={wheelStocks}
            activeCampaigns={activeCampaigns}
            onSelectETF={(etf) => setSelectedETF(etf)}
            onSelectWheelStock={(stock) => handleSelectStockForSimulator(stock)}
            onNavigate={(tab) => {
              setActiveTab(tab);
              setIsCompareViewOpen(false);
            }}
            onOpenCompare={() => {
              setActiveTab('etfs');
              setIsCompareViewOpen(true);
            }}
          />
        )}

        {/* WORKSTATION 2: ETF Intelligence Screener & Compare */}
        {activeTab === 'etfs' && (
          <div className="space-y-6">
            {/* View Switcher: Screener vs Side-by-Side Compare */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <button
                onClick={() => setIsCompareViewOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  !isCompareViewOpen
                    ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                ETF Screener & Multi-Filter Table
              </button>

              <button
                onClick={() => setIsCompareViewOpen(true)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
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
            </div>

            {!isCompareViewOpen ? (
              <ETFScreenerView
                etfs={etfs}
                onSelectETF={(etf) => setSelectedETF(etf)}
                selectedForCompare={selectedForCompare}
                onToggleCompare={handleToggleCompare}
                onOpenCompare={() => setIsCompareViewOpen(true)}
              />
            ) : (
              <ETFCompareView
                allETFs={etfs}
                selectedSymbols={selectedForCompare}
                onToggleCompare={handleToggleCompare}
                onSelectETF={(etf) => setSelectedETF(etf)}
              />
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
          </div>
        )}

        {/* WORKSTATION 4: Self-Guided Portfolio Studio */}
        {activeTab === 'portfolio' && (
          <PortfolioStudioView
            etfs={etfs}
            wheelStocks={wheelStocks}
            onSelectETF={(etf) => setSelectedETF(etf)}
            onSelectWheelStock={(stock) => handleSelectStockForSimulator(stock)}
          />
        )}

        {/* WORKSTATION 5: Research & Strategy Academy */}
        {activeTab === 'research' && (
          <ResearchAcademyView
            etfs={etfs}
            wheelStocks={wheelStocks}
            onSelectETF={(etf) => setSelectedETF(etf)}
            onSelectWheelStock={(stock) => handleSelectStockForSimulator(stock)}
          />
        )}
      </main>

      {/* ETF Detail Dossier Modal */}
      {selectedETF && (
        <ETFDetailModal
          etf={selectedETF}
          onClose={() => setSelectedETF(null)}
          onAddToCompare={handleToggleCompare}
          isCompared={selectedForCompare.includes(selectedETF.symbol)}
          onOpenCompare={() => {
            setSelectedETF(null);
            setActiveTab('etfs');
            setIsCompareViewOpen(true);
          }}
        />
      )}

      {/* Wheel Options Chain Matrix Modal */}
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
            <span className="text-slate-600">|</span>
            <span>US Markets ETF & Options Wheel Portfolio Builder</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-400">Data Feed: Live Simulation</span>
            <span>•</span>
            <span className="text-slate-400">IRS Section 1256 Ready</span>
            <span>•</span>
            <span className="text-slate-400">Options Wheel Risk Engine</span>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-4 pt-4 border-t border-slate-900 text-[10px] text-slate-600 text-center leading-relaxed">
          Disclaimer: WheelCore is an educational portfolio research and screening interface. Options trading and leveraged exchange-traded products carry significant financial risk. Always verify liquidity, ex-dividend dates, and NAV erosion risk profiles prior to executing real-money capital allocations.
        </div>
      </footer>
    </div>
  );
}

export default App;
