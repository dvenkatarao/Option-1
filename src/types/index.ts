export type ETFStrategyType =
  | 'broad_index'
  | 'dividend_growth'
  | 'covered_call'
  | 'thematic_tech'
  | 'fixed_income'
  | 'leveraged';

export type NAVHealthRating = 'Prudent / Minimal Erosion' | 'Moderate / Yield Offset' | 'High Erosion Warning';

export interface ETFHolding {
  symbol: string;
  name: string;
  weight: number; // percentage, e.g. 7.4
  shares?: number;
  value?: string;
  sector: string;
  peRatio?: number;
}

export interface DividendHistoryItem {
  date: string;
  amount: number;
  type: 'Regular' | 'Special' | 'Return of Capital';
}

export interface ETFData {
  symbol: string;
  name: string;
  issuer: string;
  category: ETFStrategyType;
  categoryLabel: string;
  aum: number; // in billions USD
  expenseRatio: number; // percentage, e.g. 0.03
  price: number;
  change24h: number; // percentage
  dividendYield: number; // percentage, e.g. 3.4
  distributionFrequency: 'Monthly' | 'Quarterly' | 'Annual';
  exDividendDate: string; // ISO date string
  payDate: string;
  navHealth: NAVHealthRating;
  navErosionScore: number; // 0 (Worst) to 100 (Best, no erosion)
  fiveYearDivGrowth: number; // %
  morningstarRating: number; // 1-5
  analystConsensus: 'Strong Buy' | 'Moderate Buy' | 'Hold';
  priceToNavDiscount: number; // % premium/discount
  beta: number;
  sharpeRatio: number;
  maxDrawdown5Y: number; // negative %
  optionsLiquidity: 'Very High' | 'High' | 'Medium' | 'Low';
  strategyDescription: string;
  strategyExecution: 'Physical Full Replication' | 'Active Covered Call (OTM)' | 'Synthetic ATM Call Spread' | 'Active Rule-Based';
  topHoldings: ETFHolding[];
  sectorBreakdown: { sector: string; weight: number }[];
  performanceHistory: {
    period: '1M' | '3M' | 'YTD' | '1Y' | '3Y' | '5Y' | '10Y';
    priceReturn: number;
    navTotalReturn: number; // with reinvested dividends
    benchmarkReturn: number; // S&P 500
  }[];
  navVsPriceChart: {
    year: string;
    navTotalReturnIndex: number;
    priceOnlyIndex: number;
    benchmarkIndex: number;
  }[];
  dividendHistory: DividendHistoryItem[];
  keyPros: string[];
  keyRisks: string[];
}

export interface OptionContract {
  strike: number;
  type: 'PUT' | 'CALL';
  expiration: string;
  dte: number; // days to expiration
  bid: number;
  ask: number;
  last: number;
  delta: number;
  theta: number;
  gamma: number;
  vega: number;
  impliedVolatility: number; // e.g. 24.5%
  openInterest: number;
  volume: number;
  collateralRequired: number; // strike * 100
  premiumReceived: number; // bid * 100
  returnOnCapital: number; // (premium / collateral) * 100
  annualizedROC: number; // (ROC * 365 / dte)
  probabilityOfProfit: number; // % approx (1 - |delta|) * 100
  downsideBuffer: number; // % buffer to break-even
  breakEven: number;
  wheelScore: number; // 1-100 proprietary score
}

export interface WheelStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change24h: number;
  peRatio: number;
  historicalPeRatio: number;
  fairValueEstimate: number;
  undervaluationPercent: number; // + is undervalued, - is overvalued
  dividendYield: number;
  qualityRating: 'AAA' | 'AA' | 'A' | 'BBB';
  economicMoat: 'Wide' | 'Narrow' | 'None';
  financialHealth: 'Excellent' | 'Good' | 'Moderate';
  altmanZScore: number;
  ivRank: number; // 0-100
  ivPercentile: number; // 0-100
  currentIV: number; // %
  earningsDate: string;
  daysToEarnings: number;
  analystConsensus: 'Strong Buy' | 'Moderate Buy' | 'Hold';
  targetPrice: number;
  wheelSuitabilityScore: number; // 1-100
  recommendedDelta: number;
  recommendedDTE: number;
  recommendedStrike: number;
  whyGoodForWheel: string;
  primaryRisk: string;
  optionChains: {
    expiration: string;
    dte: number;
    puts: OptionContract[];
    calls: OptionContract[];
  }[];
}

export interface ActiveWheelCampaign {
  id: string;
  symbol: string;
  companyName: string;
  currentStep: 'SELLING_PUT' | 'ASSIGNED_STOCK' | 'SELLING_CALL' | 'COMPLETED';
  entryDate: string;
  initialStockPrice: number;
  currentStockPrice: number;
  targetStrike: number;
  optionType: 'PUT' | 'CALL';
  expirationDate: string;
  dteRemaining: number;
  contracts: number;
  premiumCollectedTotal: number;
  currentOptionValue: number;
  collateralOrStockCost: number;
  netCostBasisPerShare: number;
  unrealizedPnL: number;
  realizedPnL: number;
  currentCycleROC: number;
  annualizedROC: number;
  status: 'In Profit' | 'At Risk' | 'Ready to Roll' | 'Assignment Expected';
  notes: string;
}

export interface PortfolioAllocationItem {
  id: string;
  type: 'ETF' | 'WHEEL_RESERVE';
  symbol: string;
  name: string;
  category: string;
  allocatedAmount: number;
  weight: number; // %
  expectedYieldOrROC: number; // %
  annualCashFlow: number; // $
  riskLevel: 'Low' | 'Moderate' | 'Growth' | 'Active Cashflow';
  notes: string;
}

export interface MarketPulse {
  ticker: string;
  name: string;
  value: number;
  change: number;
  isPositive: boolean;
  type: 'index' | 'volatility' | 'rate' | 'macro';
}
