export type BrokerType =
  | "schwab"
  | "fidelity"
  | "vanguard"
  | "ninjatrader"
  | "moomoo"
  | "manual";

export interface BrokerMeta {
  id: BrokerType;
  name: string;
  tagline: string;
  badgeColor: string;
  supportedMethods: ("snaptrade" | "plaid" | "csv" | "sandbox")[];
  popularAssets: string;
  sampleCsv: string;
}

export const SUPPORTED_BROKERS: Record<BrokerType, BrokerMeta> = {
  schwab: {
    id: "schwab",
    name: "Charles Schwab",
    tagline: "Equities, ETFs, Mutual Funds, Treasuries",
    badgeColor: "bg-sky-50 text-sky-800 ring-sky-300",
    supportedMethods: ["snaptrade", "plaid", "csv", "sandbox"],
    popularAssets: "VOO, SCHD, SWPPX, SPY",
    sampleCsv: `Symbol,Description,Quantity,Price,Cost Basis
SCHD,Schwab US Dividend Equity ETF,150.00,82.45,11250.00
VOO,Vanguard S&P 500 ETF,45.00,530.20,21500.00
QQQM,Invesco NASDAQ 100 ETF,80.00,215.10,15800.00
JEPI,JPMorgan Equity Premium Income,120.00,58.75,6900.00`,
  },
  fidelity: {
    id: "fidelity",
    name: "Fidelity Investments",
    tagline: "Brokerage, IRAs, Zero-fee index funds & ETFs",
    badgeColor: "bg-emerald-50 text-emerald-800 ring-emerald-300",
    supportedMethods: ["snaptrade", "plaid", "csv", "sandbox"],
    popularAssets: "FXAIX, FZROX, VTI, QQQ",
    sampleCsv: `Account Number,Symbol,Description,Quantity,Last Price,Cost Basis
X12345678,VTI,VANGUARD TOTAL STOCK MKT,110.00,285.40,28500.00
X12345678,VUG,VANGUARD GROWTH ETF,65.00,390.15,22100.00
X12345678,BND,VANGUARD TOTAL BOND MKT,180.00,72.60,13200.00
X12345678,AVUV,AVANTIS US SMALL CAP VAL,90.00,96.30,8100.00`,
  },
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    tagline: "Low-cost index funds, broad market ETFs",
    badgeColor: "bg-red-50 text-red-800 ring-red-300",
    supportedMethods: ["snaptrade", "plaid", "csv", "sandbox"],
    popularAssets: "VOO, VTI, BND, VXUS",
    sampleCsv: `Investment Name,Symbol,Shares,Share Price,Total Value
Vanguard S&P 500 ETF,VOO,85.000,532.10,45228.50
Vanguard Total International Stock,VXUS,220.000,64.20,14124.00
Vanguard Total Bond Market ETF,BND,140.000,72.80,10192.00
Vanguard Dividend Appreciation ETF,VIG,70.000,195.40,13678.00`,
  },
  ninjatrader: {
    id: "ninjatrader",
    name: "NinjaTrader",
    tagline: "Active futures, leveraged ETFs & multi-market trading",
    badgeColor: "bg-amber-50 text-amber-800 ring-amber-300",
    supportedMethods: ["snaptrade", "csv", "sandbox"],
    popularAssets: "TQQQ, SOXL, SPY, QQQ, UPRO",
    sampleCsv: `Account,Instrument,Position,Avg Price,Market Value
NT998877,TQQQ,250,82.40,21800.00
NT998877,SOXL,180,48.20,9100.00
NT998877,SPY,40,578.10,23124.00
NT998877,TLT,90,92.50,8325.00`,
  },
  moomoo: {
    id: "moomoo",
    name: "MooMoo (Futu)",
    tagline: "Extended-hours US trading, options & thematic ETFs",
    badgeColor: "bg-orange-50 text-orange-800 ring-orange-300",
    supportedMethods: ["snaptrade", "csv", "sandbox"],
    popularAssets: "QQQ, SMH, NVDA, IBIT, XLK",
    sampleCsv: `Symbol,Name,Qty,Cost Price,Market Value
QQQ,Invesco QQQ Trust,60,490.50,29850.00
SMH,VanEck Semiconductor ETF,55,248.10,14100.00
IBIT,iShares Bitcoin Trust,200,38.20,7800.00
XLK,Technology Select Sector SPDR,75,225.40,17250.00`,
  },
  manual: {
    id: "manual",
    name: "Manual / Custom CSV",
    tagline: "Generic spreadsheet or manual position entries",
    badgeColor: "bg-slate-50 text-slate-800 ring-slate-300",
    supportedMethods: ["csv"],
    popularAssets: "Any valid US equity or ETF ticker",
    sampleCsv: `Ticker,Quantity,Average Cost,Purchase Date
SPY,50,540.25,2024-03-15
QQQ,35,465.80,2024-04-10
SCHD,100,78.90,2023-11-20
AGG,80,96.10,2024-01-05`,
  },
};

export interface ParsedPositionImport {
  ticker: string;
  quantity: number;
  averageCostBasis: number;
  purchaseDate?: string;
  assetType?: "ETF" | "EQUITY" | "BOND" | "CASH" | "FUTURES";
  currentPrice?: number;
  notes?: string;
}

export interface CsvParseResult {
  success: boolean;
  brokerDetected: BrokerType;
  positions: ParsedPositionImport[];
  ignoredRowsCount: number;
  errors: string[];
  /** Non-fatal data-quality notes shown to the user (e.g. cost basis missing from the file). */
  warnings: string[];
}
