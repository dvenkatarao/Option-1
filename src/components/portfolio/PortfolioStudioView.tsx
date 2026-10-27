import React, { useState, useMemo } from 'react';
import { ETFData, WheelStock } from '../../types';
import { IllustrativeDataNotice } from '../common/IllustrativeDataNotice';
import { PORTFOLIO_PRESETS, PortfolioPreset } from '../../data/marketData';
import { simulatePortfolioGrowth } from '../../utils/financialMath';
import {
  PieChart as PieIcon,
  Sliders,
  TrendingUp,
  RotateCw,
  Layers,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import confetti from 'canvas-confetti';

interface PortfolioStudioViewProps {
  etfs: ETFData[];
  wheelStocks: WheelStock[];
  onSelectETF: (etf: ETFData) => void;
  onSelectWheelStock: (stock: WheelStock) => void;
}

export const PortfolioStudioView: React.FC<PortfolioStudioViewProps> = ({
  etfs,
  wheelStocks,
  onSelectETF,
  onSelectWheelStock,
}) => {
  const [totalCapital, setTotalCapital] = useState<number>(100000);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(1000);
  const [etfRatio, setEtfRatio] = useState<number>(50); // 50% ETF, 50% Wheel
  const [activePresetId, setActivePresetId] = useState<string>('balanced-growth-income');
  const [yearsHorizon, setYearsHorizon] = useState<number>(15);
  const [activeStressScenario, setActiveStressScenario] = useState<string>('sideways');

  const currentPreset = PORTFOLIO_PRESETS.find((p) => p.id === activePresetId) || PORTFOLIO_PRESETS[0];

  const handleApplyPreset = (preset: PortfolioPreset) => {
    setActivePresetId(preset.id);
    setEtfRatio(preset.etfAllocationPercent);
    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#10b981', '#06b6d4', '#f59e0b'],
    });
  };

  // Capital splits
  const etfCapital = (totalCapital * etfRatio) / 100;
  const wheelCapital = totalCapital - etfCapital;

  // Expected blended metrics
  const etfBlendedYield = 3.8; // average dividend & growth
  const wheelBlendedROC = 18.5; // average option theta ROC

  const blendedAnnualReturn = Number(
    ((etfBlendedYield + 7.0) * (etfRatio / 100) + wheelBlendedROC * ((100 - etfRatio) / 100)).toFixed(1)
  );

  const monthlyCashFlowProjected = Math.round(
    ((etfCapital * (etfBlendedYield / 100)) + (wheelCapital * (wheelBlendedROC / 100))) / 12
  );

  // 15-Year Simulation Data
  const simulationData = useMemo(() => {
    return simulatePortfolioGrowth(
      totalCapital,
      monthlyContribution,
      10.0, // S&P benchmark return 10%
      wheelBlendedROC, // 18.5%
      etfRatio / 100,
      yearsHorizon
    );
  }, [totalCapital, monthlyContribution, etfRatio, wheelBlendedROC, yearsHorizon]);

  // Dynamic Holdings Generation based on preset and capital
  const generatedETFAllocations = currentPreset.recommendedETFs.map((rec) => {
    const etf = etfs.find((e) => e.symbol === rec.symbol) || etfs[0];
    const allocatedDollars = Math.round((etfCapital * rec.weight) / 100);
    const sharesCount = Math.floor(allocatedDollars / etf.price);
    const annualDiv = Math.round(allocatedDollars * (etf.dividendYield / 100));

    return {
      symbol: etf.symbol,
      name: etf.name,
      allocatedDollars,
      sharesCount,
      annualDiv,
      dividendYield: etf.dividendYield,
      rationale: rec.rationale,
      price: etf.price,
      navHealth: etf.navHealth,
    };
  });

  const generatedWheelAllocations = currentPreset.recommendedWheelStocks.map((rec) => {
    const stock = wheelStocks.find((s) => s.symbol === rec.symbol) || wheelStocks[0];
    const allocatedDollars = Math.round((wheelCapital * rec.weight) / 100);
    const contractCollateral = stock.recommendedStrike * 100;
    const contractsPossible = Math.max(1, Math.floor(allocatedDollars / contractCollateral));
    const annualEstROC = Math.round(allocatedDollars * (stock.optionChains[0]?.puts[1]?.annualizedROC || 18) / 100);

    return {
      symbol: stock.symbol,
      name: stock.name,
      allocatedDollars,
      contractsPossible,
      contractCollateral,
      annualEstROC,
      strike: stock.recommendedStrike,
      rationale: rec.rationale,
      price: stock.price,
      moat: stock.economicMoat,
    };
  });

  // Stress test scenarios
  const stressScenarios = [
    {
      id: 'sideways',
      title: 'Sideways / Flat Market (+0% SPX)',
      description: 'The scenario applies preset option-credit and decay assumptions. This modeled cash flow is not evidence of alpha or a likely outcome.',
      portfolioOutcome: '+14.2% modeled cash flow',
      benchmarkOutcome: '0.0% Gain',
      isPositiveAlpha: true,
      badge: 'Illustrative case',
    },
    {
      id: 'correction',
      title: 'Market Pullback (-15%)',
      description: 'Put options can incur substantial losses below the strike; this preset scenario assumes credits partly offset the market decline.',
      portfolioOutcome: '-6.4% modeled portfolio outcome',
      benchmarkOutcome: '-15.0% Loss',
      isPositiveAlpha: true,
      badge: 'Preset assumptions',
    },
    {
      id: 'vix_spike',
      title: 'High Volatility Spike (VIX > 35)',
      description: 'Implied volatility and option premiums may rise alongside risk and collateral needs; the output below is a fixed sensitivity assumption.',
      portfolioOutcome: '+22.8% modeled annual cash-flow rate',
      benchmarkOutcome: '-12.0% benchmark scenario',
      isPositiveAlpha: true,
      badge: 'Illustrative case',
    },
    {
      id: 'bull_rally',
      title: 'Mega Bull Market (+25%)',
      description: 'The model assumes ETF participation while covered calls can cap gains above the strike; actual results depend on the path and instruments.',
      portfolioOutcome: '+19.5% modeled total return',
      benchmarkOutcome: '+25.0% Index Gain',
      isPositiveAlpha: false,
      badge: 'Capped Upside',
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PieIcon className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white">Self-Guided Portfolio Studio</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Build, stress-test, and compound your dual-engine portfolio blending core ETF compounding with options cash flow.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-slate-400">Modeled blended return:</span>
            <span className="text-emerald-400 font-extrabold ml-1.5">~{blendedAnnualReturn}%</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-slate-400">Total Capital:</span>
            <span className="text-white font-extrabold ml-1.5">${totalCapital.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <IllustrativeDataNotice detail="Portfolio growth, cash-flow, yield, and options-wheel inputs are fixed scenario assumptions (including 3.8% ETF yield, 7% ETF growth, 18.5% wheel ROC, and a 10% benchmark return) paired with bundled examples. These simulations are not forecasts, current provider quotes, or account performance." />

      {/* Preset Strategy Cards */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase font-mono tracking-wider">
          Step 1: Choose Model Architecture
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PORTFOLIO_PRESETS.map((preset) => {
            const isActive = preset.id === activePresetId;
            return (
              <div
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-900 border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-400/40'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {preset.etfAllocationPercent}% ETF / {preset.wheelAllocationPercent}% Wheel
                    </span>
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white">{preset.name}</h3>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">{preset.tagline}</p>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    {preset.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Example annual-yield assumption:</span>
                  <span className="text-emerald-400 font-extrabold text-sm">~{preset.exampleAnnualYieldAssumption}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Capital & Engine Ratio Sliders */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            Step 2: Customize Capital Allocation & Engine Split
          </h2>
          <span className="text-xs font-mono text-cyan-300 font-bold">
            Modeled monthly cash flow: ${monthlyCashFlowProjected.toLocaleString()}/mo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          {/* Total Capital Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-slate-300 font-mono">
              <span>Total Starting Capital</span>
              <span className="font-extrabold text-base text-white font-mono">${totalCapital.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="20000"
              max="500000"
              step="5000"
              value={totalCapital}
              onChange={(e) => setTotalCapital(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>$20k</span>
              <span>$100k</span>
              <span>$250k</span>
              <span>$500k</span>
            </div>
          </div>

          {/* Monthly DCA Contribution */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-slate-300 font-mono">
              <span>Monthly Reinvestment / DCA</span>
              <span className="font-extrabold text-base text-emerald-400 font-mono">+${monthlyContribution.toLocaleString()}/mo</span>
            </div>
            <input
              type="range"
              min="0"
              max="5000"
              step="250"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>$0</span>
              <span>$1,000</span>
              <span>$2,500</span>
              <span>$5,000</span>
            </div>
          </div>

          {/* Engine Split Ratio Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-slate-300 font-mono">
              <span>Engine Split</span>
              <span className="font-extrabold text-xs text-cyan-300 font-mono">
                {etfRatio}% ETF / {100 - etfRatio}% Wheel
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="80"
              step="5"
              value={etfRatio}
              onChange={(e) => setEtfRatio(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>20% (Max Cashflow)</span>
              <span>50% (Balanced)</span>
              <span>80% (Passive Core)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Generated Allocation Buckets (ETF Core vs Wheel Collateral) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bucket 1: ETF Compounding Engine */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Engine 1: ETF Core Portfolio</h3>
                <span className="text-[11px] text-slate-400">Capital Compounding & Organic Dividends</span>
              </div>
            </div>
            <span className="text-sm font-mono font-bold text-emerald-400">
              ${etfCapital.toLocaleString()} ({etfRatio}%)
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {generatedETFAllocations.map((item) => {
              const matchedETF = etfs.find((e) => e.symbol === item.symbol);
              return (
                <div
                  key={item.symbol}
                  onClick={() => matchedETF && onSelectETF(matchedETF)}
                  className="cursor-pointer bg-slate-950/80 hover:bg-slate-900 p-3.5 rounded-xl border border-slate-800/80 hover:border-emerald-500/50 space-y-1.5 transition"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white text-sm group-hover:text-emerald-400">{item.symbol}</span>
                      <span className="text-slate-400 text-[11px] font-sans truncate max-w-[150px]">{item.name}</span>
                    </div>
                    <span className="text-emerald-400 font-bold">${item.allocatedDollars.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Target: <strong>{item.sharesCount} Shares</strong> @ ${item.price.toFixed(2)}</span>
                    <span>Annual Div: <strong className="text-emerald-400">+${item.annualDiv}/yr</strong></span>
                  </div>

                  <p className="text-[10px] text-slate-500 font-sans pt-1 border-t border-slate-900 flex justify-between items-center">
                    <span>{item.rationale}</span>
                    <span className="text-emerald-400 font-semibold text-[10px]">Inspect →</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bucket 2: Options Wheel Cash Engine */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <RotateCw className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Engine 2: Options Wheel Cash Reserve</h3>
                <span className="text-[11px] text-slate-400">Illustrative premium-cash-flow assumption (editable scenario)</span>
              </div>
            </div>
            <span className="text-sm font-mono font-bold text-cyan-400">
              ${wheelCapital.toLocaleString()} ({100 - etfRatio}%)
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {generatedWheelAllocations.map((item) => {
              const matchedStock = wheelStocks.find((s) => s.symbol === item.symbol);
              return (
                <div
                  key={item.symbol}
                  onClick={() => matchedStock && onSelectWheelStock(matchedStock)}
                  className="cursor-pointer bg-slate-950/80 hover:bg-slate-900 p-3.5 rounded-xl border border-slate-800/80 hover:border-cyan-500/50 space-y-1.5 transition"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white text-sm">{item.symbol}</span>
                      <span className="text-slate-400 text-[11px] font-sans truncate max-w-[150px]">{item.name}</span>
                    </div>
                    <span className="text-cyan-300 font-bold">${item.allocatedDollars.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Sell: <strong>{item.contractsPossible}x Put Contract</strong> (${item.strike} Strike)</span>
                    <span>Est. ROC: <strong className="text-emerald-400">+${item.annualEstROC}/yr</strong></span>
                  </div>

                  <p className="text-[10px] text-slate-500 font-sans pt-1 border-t border-slate-900 flex justify-between items-center">
                    <span>{item.rationale}</span>
                    <span className="text-cyan-400 font-semibold text-[10px]">Simulate →</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 20-Year Compounding Runway Chart */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              20-Year Compounding & Cash Flow Projection
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Dual-Engine compounding (Reinvested Dividends + Wheel Cash Flow) vs Standard S&P 500 Buy-and-Hold.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Horizon:</span>
              <select
                value={yearsHorizon}
                onChange={(e) => setYearsHorizon(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 font-bold"
              >
                <option value={5}>5 Years</option>
                <option value={10}>10 Years</option>
                <option value={15}>15 Years</option>
                <option value={20}>20 Years</option>
              </select>
            </div>
            <span className="flex items-center gap-1.5 text-emerald-400 hidden sm:inline-flex">
              <span className="w-3 h-0.5 bg-emerald-400"></span> Dual-Engine Total Value
            </span>
          </div>
        </div>

        <div className="h-72 w-full min-w-0 min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={240}>
            <AreaChart data={simulationData}>
              <defs>
                <linearGradient id="colorDual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="year" stroke="#64748b" tickFormatter={(y) => `Yr ${y}`} tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Portfolio Value']}
                labelFormatter={(lbl) => `Year ${lbl}`}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="dualEngineValue"
                name="Dual-Engine Value"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorDual)"
              />
              <Line
                type="monotone"
                dataKey="buyAndHoldBenchmarkValue"
                name="S&P 500 Benchmark"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800 font-mono text-center text-xs">
          <div className="p-2.5 bg-slate-950 rounded-xl">
            <span className="text-slate-400 text-[10px] block">Year 5 Portfolio Value</span>
            <span className="font-bold text-white text-sm mt-0.5 block">
              ${simulationData[4]?.dualEngineValue.toLocaleString()}
            </span>
          </div>
          <div className="p-2.5 bg-slate-950 rounded-xl">
            <span className="text-slate-400 text-[10px] block">Year 5 Monthly Income</span>
            <span className="font-bold text-emerald-400 text-sm mt-0.5 block">
              ${simulationData[4]?.monthlyCashFlowAtYear.toLocaleString()}/mo
            </span>
          </div>
          <div className="p-2.5 bg-slate-950 rounded-xl">
            <span className="text-slate-400 text-[10px] block">Year 10 Portfolio Value</span>
            <span className="font-bold text-white text-sm mt-0.5 block">
              ${simulationData[9]?.dualEngineValue.toLocaleString()}
            </span>
          </div>
          <div className="p-2.5 bg-slate-950 rounded-xl">
            <span className="text-slate-400 text-[10px] block">Year 10 Monthly Income</span>
            <span className="font-bold text-emerald-400 text-sm mt-0.5 block">
              ${simulationData[9]?.monthlyCashFlowAtYear.toLocaleString()}/mo
            </span>
          </div>
        </div>
      </div>

      {/* Stress Testing & Scenario Simulator */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Macro Stress Test & Market Scenarios
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate how this dual-engine portfolio performs under severe market environments.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stressScenarios.map((scen) => (
            <div
              key={scen.id}
              onClick={() => setActiveStressScenario(scen.id)}
              className={`cursor-pointer rounded-xl p-4 border transition flex flex-col justify-between ${
                activeStressScenario === scen.id
                  ? 'bg-slate-950 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-300">
                    {scen.badge}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white">{scen.title}</h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {scen.description}
                </p>
              </div>

              <div className="mt-4 pt-2.5 border-t border-slate-800/80 font-mono text-xs">
                <div className="text-[10px] text-slate-400">Illustrative scenario output:</div>
                <div
                  className={`font-bold ${
                    scen.portfolioOutcome.includes('+') ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {scen.portfolioOutcome}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
