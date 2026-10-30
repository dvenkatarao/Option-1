import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { StockInputs } from "../lib/stock-quality";
import type { Technicals } from "../lib/technicals";
import type { OptionContract } from "../lib/wheel";

/**
 * One row per ETF. Every value is either copied verbatim from an upstream
 * provider (see `sources`) or computed by src/lib/metrics.ts from raw prices
 * and distributions. Nothing is ever generated or estimated by a model.
 */
export const etfs = pgTable("etfs", {
  ticker: text("ticker").primaryKey(),
  name: text("name"),
  category: text("category"),
  family: text("family"),
  exchange: text("exchange"),
  instrumentType: text("instrument_type"),
  inceptionDate: text("inception_date"),
  expenseRatio: doublePrecision("expense_ratio"),
  turnover: doublePrecision("turnover"),
  totalAssets: doublePrecision("total_assets"),
  navPrice: doublePrecision("nav_price"),
  reportedYield: doublePrecision("reported_yield"),
  beta3y: doublePrecision("beta_3y"),
  lastClose: doublePrecision("last_close"),
  lastCloseDate: text("last_close_date"),
  profile: jsonb("profile").$type<EtfProfileJson>(),
  metrics: jsonb("metrics").$type<EtfMetricsJson>(),
  sources: jsonb("sources").$type<Record<string, string>>(),
  lastError: text("last_error"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
});

/** Compact daily series: unix-second timestamps, close, adjusted close, distributions. */
export const etfHistory = pgTable("etf_history", {
  ticker: text("ticker").primaryKey(),
  data: jsonb("data").$type<HistoryJson>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Generic upstream response cache (macro, news, calendars, analyst data). */
export const cacheEntries = pgTable("cache_entries", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Encrypted, server-side OAuth credentials for market-data providers (never returned to the client). */
export const marketDataConnections = pgTable("market_data_connections", {
  provider: text("provider").primaryKey(),
  encryptedTokens: text("encrypted_tokens").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Quote samples taken during regular US market hours (one per ticker per 30-minute bucket).
 * Builds the history needed to measure real bid-ask spreads for the fund quality grade.
 */
export const quoteSnapshots = pgTable(
  "quote_snapshots",
  {
    ticker: text("ticker").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    price: doublePrecision("price"),
    volume: doublePrecision("volume"),
    bid: doublePrecision("bid"),
    ask: doublePrecision("ask"),
    marketState: text("market_state"),
  },
  (t) => [primaryKey({ columns: [t.ticker, t.bucket] }), index("quote_snapshots_bucket_idx").on(t.bucket)],
);

/* ==================================================================== */
/* MULTI-BROKER PORTFOLIO INTEGRATION TABLES                            */
/* ==================================================================== */

/**
 * Portfolios table: Supports multiple brokerages (Charles Schwab, Fidelity,
 * Vanguard, NinjaTrader, MooMoo, or Manual Import). Stores encrypted credentials
 * at rest via AES-256-GCM.
 */
export const portfolios = pgTable("portfolios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brokerType: text("broker_type").notNull(), // 'schwab' | 'fidelity' | 'vanguard' | 'ninjatrader' | 'moomoo' | 'manual'
  accountNumberMasked: text("account_number_masked"),
  currency: text("currency").default("USD").notNull(),
  syncStatus: text("sync_status").default("synced").notNull(), // 'synced' | 'syncing' | 'error' | 'disconnected'
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  encryptedCredentials: text("encrypted_credentials"), // AES-256-GCM encrypted broker tokens
  syncError: text("sync_error"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Positions table: Individual holdings within a portfolio.
 * Connected to the live ETF pricing engine for automated market value & P&L recalculation.
 */
export const positions = pgTable("positions", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  assetType: text("asset_type").default("ETF").notNull(), // 'ETF' | 'EQUITY' | 'BOND' | 'CASH' | 'FUTURES'
  quantity: doublePrecision("quantity").notNull(),
  averageCostBasis: doublePrecision("average_cost_basis").notNull(),
  purchaseDate: text("purchase_date"), // YYYY-MM-DD
  currentPrice: doublePrecision("current_price"),
  marketValue: doublePrecision("market_value"),
  unrealizedGain: doublePrecision("unrealized_gain"),
  unrealizedGainPct: doublePrecision("unrealized_gain_pct"),
  lastPriceUpdatedAt: timestamp("last_price_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // One row per ticker per portfolio; also guards against concurrent duplicate inserts.
  uniqueIndex("positions_portfolio_ticker_uq").on(t.portfolioId, t.ticker),
]);

/**
 * Transactions table: Ledger of buys, sells, dividend income, deposits, withdrawals.
 */
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  ticker: text("ticker"),
  type: text("type").notNull(), // 'BUY' | 'SELL' | 'DIVIDEND' | 'DEPOSIT' | 'WITHDRAWAL'
  quantity: doublePrecision("quantity"),
  price: doublePrecision("price"),
  amount: doublePrecision("amount").notNull(),
  fee: doublePrecision("fee").default(0),
  transactionDate: text("transaction_date").notNull(), // YYYY-MM-DD
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("transactions_portfolio_date_idx").on(t.portfolioId, t.transactionDate)]);

export type HistoryJson = {
  /** unix seconds */
  t: number[];
  /** split-adjusted close (price return basis) */
  c: number[];
  /** split + distribution adjusted close (total return basis) */
  a: number[];
  /** distributions: [unix seconds ex-date, amount per share] */
  d: [number, number][];
};

export type Holding = { symbol: string | null; name: string; weight: number | null };

export type EtfProfileJson = {
  holdings: Holding[];
  sectors: { sector: string; weight: number }[];
  allocation: {
    stock: number | null;
    bond: number | null;
    cash: number | null;
    other: number | null;
  };
  /** Values reported by Yahoo (fund-company-sourced), shown only as a cross-check */
  reported: {
    ytdReturn: number | null;
    threeYearAvgReturn: number | null;
    fiveYearAvgReturn: number | null;
  };
};

export type PeriodReturn = {
  price: number | null;
  total: number | null;
  /** true when the period is > 1 year and the figures are annualised */
  annualised: boolean;
};

export type EtfMetricsJson = {
  asOf: string;
  firstBar: string;
  bars: number;
  returns: {
    "1M": PeriodReturn;
    "3M": PeriodReturn;
    "6M": PeriodReturn;
    YTD: PeriodReturn;
    "1Y": PeriodReturn;
    "3Y": PeriodReturn;
    "5Y": PeriodReturn;
    "10Y": PeriodReturn;
  };
  vol1y: number | null;
  vol3y: number | null;
  maxDrawdown3y: number | null;
  maxDrawdown5y: number | null;
  high52w: number | null;
  low52w: number | null;
  fromHigh52w: number | null;
  dividends: {
    ttmAmount: number | null;
    ttmYield: number | null;
    ttmCount: number;
    frequency: string;
    lastAmount: number | null;
    lastExDate: string | null;
    growth1y: number | null;
    cagr3y: number | null;
    /** CAGR of rolling TTM distributions versus the TTM window five years earlier; null without six years of history. */
    cagr5y: number | null;
    /** distributions over last 3y as fraction of price 3y ago (not annualised) */
    cum3yPctOfStartPrice: number | null;
  };
  erosion: {
    priceReturnAnn1y: number | null;
    priceReturnAnn3y: number | null;
    priceReturnAnn5y: number | null;
    distYieldAnn3y: number | null;
    totalReturnAnn3y: number | null;
    capitalFundedShare3y: number | null;
    level: "None" | "Mild" | "Moderate" | "Severe" | "n/a";
  };
};

/* Portfolio model type helpers */
export type PortfolioRecord = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;
export type PositionRecord = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type TransactionRecord = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type StockEventsJson = {
  /** Next earnings date YYYY-MM-DD (Yahoo; may be an estimate). */
  nextEarnings: string | null;
  earningsEstimated: boolean;
  exDividend: string | null;
  dividendPerShare: number | null;
  dividendYield: number | null;
};

/** One row per scanned stock: fundamentals (as reported by Yahoo), derived technicals and event dates. */
export const stocks = pgTable("stocks", {
  ticker: text("ticker").primaryKey(),
  name: text("name"),
  sector: text("sector"),
  industry: text("industry"),
  marketCap: doublePrecision("market_cap"),
  price: doublePrecision("price"),
  priceAt: timestamp("price_at", { withTimezone: true }),
  fundamentals: jsonb("fundamentals").$type<StockInputs>(),
  events: jsonb("events").$type<StockEventsJson>(),
  technicals: jsonb("technicals").$type<Technicals>(),
  lastError: text("last_error"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
});

/** Latest option-chain scan per stock (puts within the loose filter window; the page applies the user's filters). */
export const wheelScans = pgTable("wheel_scans", {
  ticker: text("ticker").primaryKey(),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
  source: text("source"),
  fallbackReason: text("fallback_reason"),
  isDelayed: boolean("is_delayed"),
  providerStale: boolean("provider_stale"),
  price: doublePrecision("price"),
  contracts: jsonb("contracts").$type<OptionContract[]>(),
  error: text("error"),
});

/** IV snapshot history for percentile rank (Sprint C). One row per contract per scan. */
export const wheelIvHistory = pgTable(
  "wheel_iv_history",
  {
    id: text("id").primaryKey(),
    ticker: text("ticker").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    expiration: text("expiration").notNull(),
    strike: doublePrecision("strike").notNull(),
    iv: doublePrecision("iv"),
    hv30: doublePrecision("hv30"),
    dte: doublePrecision("dte"),
  },
  (t) => [index("wheel_iv_history_ticker_idx").on(t.ticker), index("wheel_iv_history_captured_idx").on(t.capturedAt)],
);

/** Timestamped provider/model option quote snapshots for contract-level history charts. */
export const optionQuoteSnapshots = pgTable(
  "option_quote_snapshots",
  {
    id: text("id").primaryKey(),
    contractSymbol: text("contract_symbol").notNull(),
    ticker: text("ticker").notNull(),
    type: text("type").notNull(),
    expiration: text("expiration").notNull(),
    strike: doublePrecision("strike").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    providerTimestamp: timestamp("provider_timestamp", { withTimezone: true }),
    source: text("source").notNull(),
    underlyingPrice: doublePrecision("underlying_price"),
    bid: doublePrecision("bid"),
    ask: doublePrecision("ask"),
    last: doublePrecision("last"),
    iv: doublePrecision("iv"),
    delta: doublePrecision("delta"),
    gamma: doublePrecision("gamma"),
    theta: doublePrecision("theta"),
    vega: doublePrecision("vega"),
    rho: doublePrecision("rho"),
    openInterest: doublePrecision("open_interest"),
    volume: doublePrecision("volume"),
  },
  (t) => [
    uniqueIndex("option_quote_snapshots_contract_bucket_idx").on(t.contractSymbol, t.bucket),
    index("option_quote_snapshots_ticker_exp_idx").on(t.ticker, t.expiration),
    index("option_quote_snapshots_captured_idx").on(t.capturedAt),
  ],
);

/** Local wheel positions tracker (optional server persistence; UI also uses localStorage). */
export const wheelPositions = pgTable("wheel_positions", {
  id: text("id").primaryKey(),
  ticker: text("ticker").notNull(),
  side: text("side").notNull(), // put_sold | assigned | call_sold | closed
  strike: doublePrecision("strike").notNull(),
  expiration: text("expiration").notNull(),
  premium: doublePrecision("premium").notNull(),
  quantity: doublePrecision("quantity").notNull().default(1),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  costBasis: doublePrecision("cost_basis"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
