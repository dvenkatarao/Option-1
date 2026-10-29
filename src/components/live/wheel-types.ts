export type LiveWheelRow = {
  g: {
    grade: string | null;
    row: {
      ticker: string;
      name: string | null;
      sector: string | null;
      price: number | null;
      fundamentals: { beta?: number | null } | null;
      events: { nextEarnings?: string | null; earningsEstimated?: boolean } | null;
    };
  };
  ctx: {
    price: number;
    nextEarnings: string | null;
    dividendYield: number | null;
    beta: number | null;
  };
  best: {
    contract: {
      strike: number;
      expiration: string;
      delta: number | null;
      iv: number | null;
      bid: number | null;
      ask: number | null;
    };
    dte: number;
    credit: number;
    cash: number;
    annRoc: number;
    roc: number;
    score: number;
    breakeven: number;
    breakevenCushion: number;
    probOtm: number;
    account: { flag: string };
  };
  count: number;
  source: string | null;
  fallbackReason: string | null;
  scannedAt: string;
  stale: boolean;
};

export type LiveWheelResults = {
  rows: LiveWheelRow[];
  sectors: string[];
  heldBackByEarnings: { ticker: string; days: number | null }[];
  earningsWatch: {
    g: { row: { ticker: string; name: string | null } };
    days: number;
    estimated: boolean;
  }[];
  rejected: Record<string, number>;
  info: {
    eligible: number;
    scanned: number;
    failed: { ticker: string; error: string }[];
    waiting: number;
    oldest: string | null;
    sources: Record<string, number>;
    fallbacks: number;
    universe: number;
    hydrated: number;
    staleStocks: number;
    missingFields: number;
    missingDropped: number;
  };
  ivRanks: Record<string, number | null>;
  generatedAt: string;
};
