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
  exampleAnnualYieldAssumption: number; // %
  description: string;
  recommendedETFs: { symbol: string; weight: number; rationale: string }[];
  recommendedWheelStocks: { symbol: string; weight: number; rationale: string }[];
}

export const PORTFOLIO_PRESETS: PortfolioPreset[] = [
  {
    id: 'balanced-growth-income',
    name: 'Balanced ETF + Wheel Example',
    tagline: '50% ETF foundation + 50% wheel scenario',
    riskProfile: 'Balanced Growth & Income',
    etfAllocationPercent: 50,
    wheelAllocationPercent: 50,
    exampleAnnualYieldAssumption: 14.8,
    description: 'An illustrative mix of broad-market and dividend ETFs with cash-secured puts. Option premiums vary, assignment can create equity losses, and the model percentages are assumptions—not forecasts.',
    recommendedETFs: [
      { symbol: 'VOO', weight: 40, rationale: 'Broad US large-cap exposure; market prices and total returns can decline.' },
      { symbol: 'SCHD', weight: 30, rationale: 'Dividend-oriented equity exposure; distributions and drawdowns are not guaranteed.' },
      { symbol: 'QQQM', weight: 30, rationale: 'Growth-oriented exposure with meaningful sector concentration and volatility.' },
    ],
    recommendedWheelStocks: [
      { symbol: 'MSFT', weight: 35, rationale: 'Illustrative put candidate only; assignment and stock losses remain possible.' },
      { symbol: 'GOOGL', weight: 35, rationale: 'Valuation and delta are not reliable measures of future return or win rate.' },
      { symbol: 'AAPL', weight: 30, rationale: 'Illustrative company selection; buybacks do not prevent market losses.' },
    ],
  },
  {
    id: 'high-cashflow-income',
    name: 'Income-Oriented Scenario Example',
    tagline: '30% covered-call ETFs + 70% wheel scenario',
    riskProfile: 'Maximum Cash Flow Engine',
    etfAllocationPercent: 30,
    wheelAllocationPercent: 70,
    exampleAnnualYieldAssumption: 18.5,
    description: 'This high-cash-flow scenario combines covered-call funds and cash-secured puts. Distribution rates are not total returns; options can be assigned and expose the account to losses.',
    recommendedETFs: [
      { symbol: 'JEPI', weight: 40, rationale: 'Covered-call fund example; distributions, total returns, and volatility vary.' },
      { symbol: 'DIVO', weight: 35, rationale: 'Actively managed covered-call example; outcomes depend on strategy and market path.' },
      { symbol: 'SGOV', weight: 25, rationale: 'Short Treasury exposure; yield changes and interest-rate risk remains.' },
    ],
    recommendedWheelStocks: [
      { symbol: 'NVDA', weight: 30, rationale: 'Higher implied volatility may raise premium and risk; annualized ROC is not expected return.' },
      { symbol: 'AMZN', weight: 35, rationale: 'Illustrative put candidate; company and options risks remain.' },
      { symbol: 'CAT', weight: 35, rationale: 'Illustrative put candidate; cyclical equity and assignment risks remain.' },
    ],
  },
  {
    id: 'conservative-fortress',
    name: 'Conservative Allocation Example',
    tagline: '75% core ETFs + 25% cash-secured put scenario',
    riskProfile: 'Conservative Income',
    etfAllocationPercent: 75,
    wheelAllocationPercent: 25,
    exampleAnnualYieldAssumption: 9.2,
    description: 'An illustrative conservative mix of equity, Treasury, and options exposure. It is not capital-protected: bonds and stocks can fall, and puts can incur substantial losses.',
    recommendedETFs: [
      { symbol: 'SCHD', weight: 40, rationale: 'Dividend-oriented equity exposure; NAV and distributions can decline.' },
      { symbol: 'VIG', weight: 35, rationale: 'Dividend-growth strategy example; historical raises do not guarantee future payments.' },
      { symbol: 'SGOV', weight: 25, rationale: 'Short Treasury exposure; liquidity and principal value vary with market conditions.' },
    ],
    recommendedWheelStocks: [
      { symbol: 'JNJ', weight: 50, rationale: 'Illustrative put candidate; credit quality does not eliminate equity or assignment risk.' },
      { symbol: 'KO', weight: 50, rationale: 'Consumer-staples exposure; no sector is recession-proof and collateral depends on price.' },
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
    title: 'The Options Wheel: Mechanics, Assignment & Risk',
    category: 'Wheel Strategy',
    readTime: '6 min read',
    summary: 'Learn how cash-secured puts and covered calls work, including assignment, break-even, and downside risk. The wheel is not a reliable-income formula or a guarantee.',
    keyTakeaways: [
      "A cash-secured put seller can be assigned at the strike. Use only collateral and underlyings you can hold through losses; delta is a model-dependent proxy, not a measured win rate.",
      "If the put expires worthless, the seller keeps the credit before costs. A 50% exit target is a trading rule, not evidence that closing or rolling improves outcomes.",
      "If assigned, shares are purchased at the strike. Premium affects the economic basis, but costs, taxes, and later price moves also matter.",
      "A covered-call writer may be assigned and give up gains above the strike; the shares still carry downside risk, and dividends are not guaranteed.",
      "Company labels or balance-sheet screens cannot remove equity, liquidity, volatility, or assignment risk. Do not sell an option unless you understand its obligations.",
    ],
    content: `Selling a cash-secured put earns a credit in exchange for accepting the obligation to buy shares at the strike if assigned. A sharp price decline can produce losses far greater than the premium. If shares are assigned, a covered call can generate another credit but limits some gains above its strike while leaving the shares exposed to losses.\n\nDelta is a model output, not an observed win rate; its probability interpretation depends on model assumptions and market inputs. Days to expiration, volatility, liquidity, early assignment, dividends, fees, taxes, and the price path all affect outcomes. Annualizing one option credit does not make it an expected or repeatable return. Paper-test with realistic quotes and adverse scenarios before considering any trade.`,
  },
  {
    id: 'guide-nav-erosion',
    title: 'Distribution Yield, NAV & Total Return',
    category: 'Risk & NAV Erosion',
    readTime: '8 min read',
    summary: 'Separate a fund’s distribution rate from its investment return. Covered-call outcomes, NAV changes, and distribution policies vary by fund and market path.',
    keyTakeaways: [
      "Covered calls can limit gains above their strike but do not eliminate downside; strategies and option coverage differ across funds.",
      "NAV reflects the fund’s holdings and strategy. Its path depends on market returns, volatility, distributions, fees, and implementation; no single pattern is inevitable.",
      "A distribution’s tax classification, including return of capital, cannot be inferred from its headline yield. Review fund tax documents and distinguish cash paid from total return.",
      "Compare NAV or price change plus distributions on a consistent reinvestment basis; fund expenses are reflected in reported performance. Match the benchmark to the fund’s objective and risk.",
      "No covered-call structure guarantees safety or capital growth. Review each fund’s prospectus, option strategy, distribution history, and total-return record.",
    ],
    content: `A distribution rate is not an investment return. For example, a hypothetical fund can distribute cash while its NAV falls; the combined result may be negative even when the cash distribution appears large. Conversely, price and distribution outcomes can vary substantially across strategies and periods.\n\nCompare NAV or price changes together with distributions using a consistent reinvestment basis, and consider fees, volatility, drawdowns, and the fund’s stated objective. Do not infer return of capital from yield alone; check official distribution and tax materials. Past performance does not predict future results.`,
  },
  {
    id: 'guide-tax-optimization',
    title: 'Tax Considerations for Options & ETF Investors',
    category: 'Tax Strategy',
    readTime: '5 min read',
    summary: 'General U.S. tax concepts for options and fund distributions. Treatment depends on the instrument, account, holding period, and individual circumstances; this is not tax advice.',
    keyTakeaways: [
      "Tax-advantaged account rules vary. Contributions, eligible trades, and withdrawals are subject to account-specific requirements, limits, and potential taxes or penalties.",
      "Section 1256 treatment applies only to qualifying contracts; it should not be assumed for an ETF, its distributions, or every index-linked instrument. Confirm classification with a tax professional.",
      "A fund distribution is not automatically a qualified dividend. Tax character, holding-period rules, and the investor’s tax bracket affect treatment.",
      "Options, straddles, and in-the-money covered calls can affect holding periods and tax treatment. Keep trade and distribution records and seek instrument-specific tax guidance.",
    ],
    content: `Options premiums and fund distributions may receive different tax treatment depending on the contract, fund reporting, account type, holding period, and taxpayer circumstances. Tax-advantaged accounts also have eligibility, contribution, trading, and withdrawal rules. Keep statements and official tax forms, and consult a qualified tax professional before relying on a strategy’s assumed tax outcome.`,
  },
];
