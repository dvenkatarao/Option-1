import { MarketPulse } from '../types';

export const MARKET_PULSE_ITEMS: MarketPulse[] = [
  { ticker: 'SPY', name: 'S&P 500 ETF', value: 588.42, change: 0.48, isPositive: true, type: 'index' },
  { ticker: 'QQQ', name: 'Invesco QQQ (Nasdaq 100)', value: 508.15, change: 0.72, isPositive: true, type: 'index' },
  { ticker: 'VIX', name: 'CBOE Volatility Index', value: 14.85, change: -3.20, isPositive: false, type: 'volatility' },
  { ticker: 'US10Y', name: 'US 10-Year Treasury Yield', value: 4.41, change: -0.04, isPositive: false, type: 'rate' },
  { ticker: 'DXY', name: 'US Dollar Index', value: 104.20, change: 0.12, isPositive: true, type: 'macro' },
  { ticker: 'SCHD', name: 'Schwab US Dividend', value: 84.20, change: 0.18, isPositive: true, type: 'index' },
];

export interface PortfolioPreset {
  id: string;
  name: string;
  tagline: string;
  riskProfile: 'Conservative Income' | 'Balanced Growth & Income' | 'Maximum Cash Flow Engine';
  etfAllocationPercent: number;
  wheelAllocationPercent: number;
  expectedAnnualYield: number; // %
  description: string;
  recommendedETFs: { symbol: string; weight: number; rationale: string }[];
  recommendedWheelStocks: { symbol: string; weight: number; rationale: string }[];
}

export const PORTFOLIO_PRESETS: PortfolioPreset[] = [
  {
    id: 'balanced-growth-income',
    name: 'The Dual-Engine Growth & Wheel',
    tagline: '50% ETF Foundation + 50% Active Wheel Cash Flow',
    riskProfile: 'Balanced Growth & Income',
    etfAllocationPercent: 50,
    wheelAllocationPercent: 50,
    expectedAnnualYield: 14.8,
    description: 'The premier architecture for personal wealth: Core equity compounding via VOO and SCHD while utilizing cash-secured puts on AAA stalwarts (MSFT, GOOGL, NVDA) to generate 18-24% options cash flow.',
    recommendedETFs: [
      { symbol: 'VOO', weight: 40, rationale: 'Foundational US market growth anchor with zero NAV erosion' },
      { symbol: 'SCHD', weight: 30, rationale: '11% dividend growth and recession dampener' },
      { symbol: 'QQQM', weight: 30, rationale: 'Tech & innovation compounding engine' },
    ],
    recommendedWheelStocks: [
      { symbol: 'MSFT', weight: 35, rationale: 'AAA balance sheet with strong support at 400 strike' },
      { symbol: 'GOOGL', weight: 35, rationale: '22x P/E undervaluation discount with 82% POP' },
      { symbol: 'AAPL', weight: 30, rationale: 'Unstoppable share buybacks providing downside protection' },
    ],
  },
  {
    id: 'high-cashflow-income',
    name: 'Retirement Cash-Flow Accelerator',
    tagline: '30% Covered Call ETFs + 70% Options Wheel',
    riskProfile: 'Maximum Cash Flow Engine',
    etfAllocationPercent: 30,
    wheelAllocationPercent: 70,
    expectedAnnualYield: 18.5,
    description: 'Designed for financial independence and high recurring monthly income. Pairs JEPI/DIVO for hands-off 6-8% monthly dividends with an active 0.20-0.25 delta Cash-Secured Put engine across high-moat blue chips.',
    recommendedETFs: [
      { symbol: 'JEPI', weight: 40, rationale: '7.4% monthly distribution with lower beta' },
      { symbol: 'DIVO', weight: 35, rationale: 'Prudent tactical calls with dividend growth' },
      { symbol: 'SGOV', weight: 25, rationale: '4.9% risk-free yield for collateral reserves' },
    ],
    recommendedWheelStocks: [
      { symbol: 'NVDA', weight: 30, rationale: 'High IV yielding 28%+ annualized ROC on 0.20 delta' },
      { symbol: 'AMZN', weight: 35, rationale: 'AWS cloud margin expansion and rich option liquidity' },
      { symbol: 'CAT', weight: 35, rationale: 'Infrastructure tailwinds and stable industrial cash flow' },
    ],
  },
  {
    id: 'conservative-fortress',
    name: 'Fortress Capital Preservation & Yield',
    tagline: '75% Core Dividend Aristocrats + 25% Ultra-Safe Puts',
    riskProfile: 'Conservative Income',
    etfAllocationPercent: 75,
    wheelAllocationPercent: 25,
    expectedAnnualYield: 9.2,
    description: 'Prioritizes maximum capital preservation and sleep-at-night security. Heavy weighting in SCHD, VIG, and SGOV, paired with ultra-low 0.12 delta puts on AAA-rated dividend aristocrats.',
    recommendedETFs: [
      { symbol: 'SCHD', weight: 40, rationale: 'High dividend growth with zero NAV decay' },
      { symbol: 'VIG', weight: 35, rationale: 'Aristocrats with 10+ years consecutive hikes' },
      { symbol: 'SGOV', weight: 25, rationale: 'US Treasury safety and liquidity' },
    ],
    recommendedWheelStocks: [
      { symbol: 'JNJ', weight: 50, rationale: 'AAA credit rating, 62-year dividend streak' },
      { symbol: 'KO', weight: 50, rationale: 'Recession-proof staple with low collateral requirement' },
    ],
  },
];

export interface EducationalGuide {
  id: string;
  title: string;
  category: 'Wheel Strategy' | 'ETF Deep Dive' | 'Risk & NAV Erosion' | 'Tax Strategy';
  readTime: string;
  summary: string;
  keyTakeaways: string[];
  content: string;
}

export const EDUCATIONAL_GUIDES: EducationalGuide[] = [
  {
    id: 'guide-wheel-mastery',
    title: 'The Options Wheel Strategy: Complete Blueprint for US Blue-Chips',
    category: 'Wheel Strategy',
    readTime: '6 min read',
    summary: 'Master the 4-phase systematic income machine that turns volatile markets into consistent 15-25% cash flow without ever shorting stock or guessing market direction.',
    keyTakeaways: [
      'Phase 1: Sell Cash-Secured Puts (CSP) on high-quality, undervalued blue-chips you want to own long term at 0.20 - 0.25 Delta (75-80% Win Rate) with 30-45 DTE.',
      'Phase 2: If put expires OTM, keep 100% of premium. Close at 50% profit to increase annualized ROC.',
      'Phase 3: If assigned, buy 100 shares at strike price. Your actual net cost basis is Strike Price minus Put Premium collected.',
      'Phase 4: Sell Covered Calls (CC) at or above your net cost basis. Collect second stream of premium plus any upside stock appreciation and dividends.',
      'Golden Rule: NEVER wheel a junk/meme stock for high IV. Only wheel stocks with wide economic moats and pristine balance sheets.',
    ],
    content: `The Wheel Strategy is one of the most effective mechanical options methods for personal wealth building when paired with the discipline of value investing. By selling options outside the money, time decay (Theta) becomes your primary profit generator.

Choosing the right strike is critical:
• Delta 0.15 - 0.20: Conservative (80-85% Probability of Profit). Great for large accounts seeking steady 12-18% annualized ROC.
• Delta 0.25 - 0.30: Balanced (70-75% Probability of Profit). Generates 20-30% annualized ROC while leaving a 4-8% downside safety buffer.
• Days to Expiration (DTE): 30 to 45 days captures the accelerated slope of the theta decay curve without taking on binary same-week gamma risk.`,
  },
  {
    id: 'guide-nav-erosion',
    title: 'NAV Erosion Decoded: Synthetic Yield Traps vs Organic Dividend Growth',
    category: 'Risk & NAV Erosion',
    readTime: '8 min read',
    summary: 'Why headline 30-60% yields in single-stock synthetic covered call ETFs (e.g. YieldMax, QYLD) often destroy investor wealth, and how to spot structural NAV decay before investing.',
    keyTakeaways: [
      'The Covered Call Capping Asymmetry: Synthetic ETFs sell ATM calls which cap 100% of underlying gains during market rallies, but suffer 100% of the downside during crashes.',
      'Over time, this asymmetry forces the fund Net Asset Value (NAV) into a downward staircase pattern: down in corrections, unable to recover in bull markets.',
      'Return of Capital (ROC) distributions: When a fund pays out your own principal as "yield", it triggers permanent reverse-compounding.',
      'True Total Return Formula: Price Return + Reinvested Dividends minus Expense Drag. Compare total return to S&P 500 (VOO) before chasing nominal yield percentages.',
      'Safe Covered Call Alternatives: Choose funds with OTM call writing (JEPI, JEPQ) or tactical rules (DIVO) that preserve capital growth.',
    ],
    content: `Many retail investors fall victim to the "Yield Trap". A fund advertising a 50% distribution rate seems irresistible. However, if the share price drops by 40% in the same year, your net total return is severely impaired.

When analyzing any income ETF, always check the 3-Year Total Return vs Price Return index. In funds like VOO or SCHD, total return exceeds price return because the NAV continues to appreciate while paying sustainable dividends. In contrast, heavy synthetic covered call funds show steady downward sloping price charts requiring immediate full reinvestment just to break even.`,
  },
  {
    id: 'guide-tax-optimization',
    title: 'Tax Optimization for Wheelers & ETF Investors (US IRS Section 1256 & Roth IRAs)',
    category: 'Tax Strategy',
    readTime: '5 min read',
    summary: 'How to maximize after-tax returns on cash-secured puts, covered calls, and dividend distributions in taxable vs tax-advantaged accounts.',
    keyTakeaways: [
      'Roth IRA Advantage: Options wheel premiums and high-yield ETF distributions compound 100% tax-free with zero capital gains tax at withdrawal.',
      'Section 1256 Index Contracts: Index options (SPX, NDX) and funds like SPYI benefit from the 60% Long-Term / 40% Short-Term capital gains blend regardless of holding period.',
      'Qualified Dividends: Traditional dividend ETFs (VOO, SCHD, VIG) are taxed at preferential long-term capital gains rates (0%, 15%, or 20%) rather than ordinary income.',
      'Covered Call Tax Straddle Rules: Be cautious when writing in-the-money (ITM) covered calls in taxable accounts as they may suspend the holding period for qualified dividend status.',
    ],
    content: `Executing the Wheel Strategy inside a Roth IRA or Self-Directed 401(k) provides the holy grail of financial independence: tax-free compounding of high-velocity options income. If wheeling inside a taxable brokerage account, prioritize index-level instruments or pair your wheeling with broad index ETFs to balance short-term ordinary income with long-term unrealized capital growth.`,
  },
];
