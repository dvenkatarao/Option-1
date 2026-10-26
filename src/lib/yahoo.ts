import { BROWSER_UA, HttpError, fetchText } from "./http";

/**
 * Yahoo Finance (UNOFFICIAL, keyless). Verified working from this environment:
 *   v8/finance/chart, v7/finance/quote (crumb), v10/finance/quoteSummary (crumb), RSS headlines.
 * No SLA and no published terms for programmatic use -> treat as prototype-grade
 * and keep a documented fallback (see sources catalog).
 */

type Session = { cookie: string; crumb: string; at: number };
const g = globalThis as typeof globalThis & { __yahooSession?: Session; __yahooSessionP?: Promise<Session> };

async function createSession(): Promise<Session> {
  const res = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": BROWSER_UA },
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Yahoo session: no cookie returned");
  const crumb = await fetchText("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { Cookie: cookie, "User-Agent": BROWSER_UA },
    timeoutMs: 10000,
  });
  if (!crumb || crumb.includes("<") || crumb.length > 40) throw new Error("Yahoo session: invalid crumb");
  return { cookie, crumb, at: Date.now() };
}

async function getSession(force = false): Promise<Session> {
  if (!force && g.__yahooSession && Date.now() - g.__yahooSession.at < 25 * 60 * 1000) return g.__yahooSession;
  if (!g.__yahooSessionP) {
    g.__yahooSessionP = createSession()
      .then((s) => {
        g.__yahooSession = s;
        return s;
      })
      .finally(() => {
        g.__yahooSessionP = undefined;
      });
  }
  return g.__yahooSessionP;
}

export async function crumbFetch(buildUrl: (crumb: string) => string): Promise<string> {
  let session = await getSession();
  try {
    return await fetchText(buildUrl(session.crumb), { headers: { Cookie: session.cookie, "User-Agent": BROWSER_UA }, retries: 2 });
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
      session = await getSession(true);
      return await fetchText(buildUrl(session.crumb), { headers: { Cookie: session.cookie, "User-Agent": BROWSER_UA }, retries: 1 });
    }
    throw e;
  }
}

export type YahooChart = {
  meta: {
    symbol: string;
    longName?: string;
    shortName?: string;
    instrumentType?: string;
    exchangeName?: string;
    fullExchangeName?: string;
    currency?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    chartPreviousClose?: number;
    firstTradeDate?: number;
  };
  t: number[];
  c: number[];
  a: number[];
  d: [number, number][];
};

export async function yahooChart(symbol: string, range = "10y", interval = "1d"): Promise<YahooChart> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div%7Csplit&includeAdjustedClose=true`;
  const text = await fetchText(url, { retries: 2, timeoutMs: 25000, headers: { "User-Agent": BROWSER_UA } });
  const j = JSON.parse(text);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`Yahoo chart: no data for ${symbol} (${j?.chart?.error?.description ?? "empty"})`);
  const ts: number[] = r.timestamp ?? [];
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const adj: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose ?? closes;
  const t: number[] = [];
  const c: number[] = [];
  const a: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const cv = closes[i];
    const av = adj[i];
    if (cv == null || av == null || !Number.isFinite(cv) || !Number.isFinite(av)) continue;
    t.push(ts[i]);
    c.push(round(cv, 4));
    a.push(round(av, 4));
  }
  const divsObj: Record<string, { amount: number; date: number }> = r.events?.dividends ?? {};
  const d = Object.values(divsObj)
    .map((x) => [x.date, x.amount] as [number, number])
    .sort((x, y) => x[0] - y[0]);
  return { meta: r.meta, t, c, a, d };
}

/** Daily OHLCV bars (unadjusted prices, as traded) for technical levels. */
export async function yahooBars(symbol: string, range = "2y"): Promise<{ bars: { t: number; o: number; h: number; l: number; c: number; v: number }[]; price: number | null }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includeAdjustedClose=false`;
  const text = await fetchText(url, { retries: 2, timeoutMs: 25000, headers: { "User-Agent": BROWSER_UA } });
  const r = JSON.parse(text)?.chart?.result?.[0];
  if (!r) throw new Error(`Yahoo chart: no data for ${symbol}`);
  const q = r.indicators?.quote?.[0] ?? {};
  const ts: number[] = r.timestamp ?? [];
  const bars: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
    if ([o, h, l, c, v].some((x) => typeof x !== "number" || !Number.isFinite(x)) || c <= 0) continue;
    bars.push({ t: ts[i], o, h, l, c, v });
  }
  return { bars, price: typeof r.meta?.regularMarketPrice === "number" ? r.meta.regularMarketPrice : null };
}

export type YahooQuote = {
  symbol: string;
  name?: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  prevClose: number | null;
  volume: number | null;
  marketState?: string;
  marketTime?: number;
  netAssets?: number | null;
  trailingYield?: number | null;
  ytdReturn?: number | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  avgVolume3m?: number | null;
  bid?: number | null;
  ask?: number | null;
};

type RawNum = number | null | undefined;
const num = (x: RawNum) => (typeof x === "number" && Number.isFinite(x) ? x : null);

export async function yahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
  if (!symbols.length) return [];
  const out: YahooQuote[] = [];
  for (let i = 0; i < symbols.length; i += 80) {
    const chunk = symbols.slice(i, i + 80);
    const text = await crumbFetch(
      (crumb) =>
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(","))}&crumb=${encodeURIComponent(crumb)}`,
    );
    const j = JSON.parse(text);
    for (const q of j?.quoteResponse?.result ?? []) {
      out.push({
        symbol: q.symbol,
        name: q.longName ?? q.shortName,
        price: num(q.regularMarketPrice),
        change: num(q.regularMarketChange),
        changePct: num(q.regularMarketChangePercent),
        prevClose: num(q.regularMarketPreviousClose),
        volume: num(q.regularMarketVolume),
        marketState: q.marketState,
        marketTime: num(q.regularMarketTime) ?? undefined,
        netAssets: num(q.netAssets),
        trailingYield: num(q.trailingAnnualDividendYield),
        ytdReturn: num(q.ytdReturn),
        fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
        avgVolume3m: num(q.averageDailyVolume3Month),
        bid: num(q.bid),
        ask: num(q.ask),
      });
    }
  }
  return out;
}

export type QuoteSummary = Record<string, any>;

export async function yahooQuoteSummary(symbol: string, modules: string[]): Promise<QuoteSummary> {
  const text = await crumbFetch(
    (crumb) =>
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(",")}&crumb=${encodeURIComponent(crumb)}`,
  );
  const j = JSON.parse(text);
  const r = j?.quoteSummary?.result?.[0];
  if (!r) throw new Error(`Yahoo quoteSummary: no data for ${symbol} (${j?.quoteSummary?.error?.description ?? "empty"})`);
  return r;
}

/** Yahoo returns { raw, fmt } objects; extract the raw number. */
export function raw(x: unknown): number | null {
  if (x && typeof x === "object" && "raw" in x) return num((x as { raw: RawNum }).raw);
  return num(x as RawNum);
}

export function round(n: number, dp = 4) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export { num };
