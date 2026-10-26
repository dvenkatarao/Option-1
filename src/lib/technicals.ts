/**
 * Pure technical-analysis helpers (no I/O). All functions take daily or intraday bars oldest -> newest.
 * Indicators describe the CURRENT STATE of a price series; none of them is a forecast.
 */

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function sma(values: number[], n: number): number | null {
  if (values.length < n || n <= 0) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

/** Full EMA series, seeded with the SMA of the first n values (standard convention). Entries before index n-1 are NaN. */
export function emaSeries(values: number[], n: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < n || n <= 0) return out;
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = 0; i < n; i++) prev += values[i];
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function ema(values: number[], n: number): number | null {
  const s = emaSeries(values, n);
  const last = s[s.length - 1];
  return fin(last) ? last : null;
}

/** Wilder's RSI. Needs at least n+1 closes. */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

export type Macd = { line: number; signal: number; hist: number; prevHist: number; state: "bullish" | "bearish"; crossed: "up" | "down" | null };

/** MACD(12,26,9). `crossed` is set when the histogram changed sign on the latest bar. */
export function macd(closes: number[], fast = 12, slow = 26, sig = 9): Macd | null {
  if (closes.length < slow + sig) return null;
  const f = emaSeries(closes, fast);
  const s = emaSeries(closes, slow);
  const line: number[] = [];
  for (let i = 0; i < closes.length; i++) if (fin(f[i]) && fin(s[i])) line.push(f[i] - s[i]);
  const signal = emaSeries(line, sig);
  const i = line.length - 1;
  if (!fin(signal[i]) || !fin(signal[i - 1])) return null;
  const hist = line[i] - signal[i];
  const prevHist = line[i - 1] - signal[i - 1];
  return {
    line: line[i],
    signal: signal[i],
    hist,
    prevHist,
    state: hist >= 0 ? "bullish" : "bearish",
    crossed: prevHist <= 0 && hist > 0 ? "up" : prevHist >= 0 && hist < 0 ? "down" : null,
  };
}

export type Bollinger = { mid: number; upper: number; lower: number; pctB: number; bandwidth: number };

export function bollinger(closes: number[], n = 20, k = 2): Bollinger | null {
  if (closes.length < n) return null;
  const w = closes.slice(-n);
  const mid = w.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / n);
  const upper = mid + k * sd;
  const lower = mid - k * sd;
  const last = closes[closes.length - 1];
  return { mid, upper, lower, pctB: upper === lower ? 0.5 : (last - lower) / (upper - lower), bandwidth: mid ? (upper - lower) / mid : 0 };
}

/** Wilder's ATR. */
export function atr(bars: Bar[], n = 14): number | null {
  if (bars.length < n + 1) return null;
  const tr = (i: number) => Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
  let a = 0;
  for (let i = 1; i <= n; i++) a += tr(i);
  a /= n;
  for (let i = n + 1; i < bars.length; i++) a = (a * (n - 1) + tr(i)) / n;
  return a;
}

const typical = (b: Bar) => (b.h + b.l + b.c) / 3;

/** Volume-weighted moving average of closes over the last n bars. */
export function vwma(bars: Bar[], n: number): number | null {
  if (bars.length < n) return null;
  let pv = 0;
  let v = 0;
  for (const b of bars.slice(-n)) {
    pv += b.c * b.v;
    v += b.v;
  }
  return v > 0 ? pv / v : null;
}

/** VWAP anchored at bar index `from` (typical price x volume, cumulative to the last bar). */
export function anchoredVwap(bars: Bar[], from: number): number | null {
  if (from < 0 || from >= bars.length) return null;
  let pv = 0;
  let v = 0;
  for (let i = from; i < bars.length; i++) {
    pv += typical(bars[i]) * bars[i].v;
    v += bars[i].v;
  }
  return v > 0 ? pv / v : null;
}

/** Session VWAP from intraday bars of the most recent trading day (UTC date of the last bar's NY session). */
export function sessionVwap(intraday: Bar[]): number | null {
  if (!intraday.length) return null;
  const day = (t: number) => new Date(t * 1000 - 5 * 3600_000).toISOString().slice(0, 10); // close enough to group one NY session
  const lastDay = day(intraday[intraday.length - 1].t);
  const todays = intraday.filter((b) => day(b.t) === lastDay);
  return anchoredVwap(todays, 0);
}

/** Annualised standard deviation of daily log returns over the last n returns. */
export function historicalVol(closes: number[], n = 30): number | null {
  if (closes.length < n + 1) return null;
  const r: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / n;
  const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let dd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    dd = Math.max(dd, (peak - c) / peak);
  }
  return dd;
}

/* ------------------------------------------------------------------ */
/* Support & resistance                                                 */
/* ------------------------------------------------------------------ */

export type Level = { price: number; kind: "support" | "resistance"; touches: number; lastTouchDaysAgo: number; distancePct: number };

/**
 * Horizontal levels from swing pivots: a pivot high/low is a bar whose high/low is the extreme of the `k` bars on each side.
 * Pivots within `tolPct` of each other are merged into one level (price = mean, touches = pivot count).
 * Levels above the last close are resistance, below are support. Only levels with >= minTouches are kept.
 */
export function supportResistance(bars: Bar[], opts: { k?: number; tolPct?: number; minTouches?: number; lookback?: number; max?: number } = {}): { supports: Level[]; resistances: Level[] } {
  const { k = 5, tolPct = 0.015, minTouches = 2, lookback = 252, max = 3 } = opts;
  const w = bars.slice(-lookback);
  if (w.length < 2 * k + 1) return { supports: [], resistances: [] };
  const last = w[w.length - 1].c;
  const pivots: { price: number; idx: number }[] = [];
  for (let i = k; i < w.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (w[j].h >= w[i].h) isHigh = false;
      if (w[j].l <= w[i].l) isLow = false;
    }
    if (isHigh) pivots.push({ price: w[i].h, idx: i });
    if (isLow) pivots.push({ price: w[i].l, idx: i });
  }
  pivots.sort((a, b) => a.price - b.price);
  const clusters: { sum: number; n: number; lastIdx: number }[] = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c && p.price <= (c.sum / c.n) * (1 + tolPct)) {
      c.sum += p.price;
      c.n += 1;
      c.lastIdx = Math.max(c.lastIdx, p.idx);
    } else clusters.push({ sum: p.price, n: 1, lastIdx: p.idx });
  }
  const levels: Level[] = clusters
    .filter((c) => c.n >= minTouches)
    .map((c) => {
      const price = c.sum / c.n;
      return {
        price,
        kind: price < last ? ("support" as const) : ("resistance" as const),
        touches: c.n,
        lastTouchDaysAgo: w.length - 1 - c.lastIdx,
        distancePct: (price - last) / last,
      };
    });
  const supports = levels.filter((l) => l.kind === "support").sort((a, b) => b.price - a.price).slice(0, max);
  const resistances = levels.filter((l) => l.kind === "resistance").sort((a, b) => a.price - b.price).slice(0, max);
  return { supports, resistances };
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                             */
/* ------------------------------------------------------------------ */

export type Technicals = {
  asOf: string;
  price: number;
  sma50: number | null;
  sma200: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: Macd | null;
  boll: Bollinger | null;
  atr14: number | null;
  atrPct: number | null;
  vwma20: number | null;
  vwma50: number | null;
  vwapYtd: number | null;
  vwapFrom52wLow: number | null;
  hi52: number | null;
  lo52: number | null;
  /** Fraction below the 52-week high (0 = at the high). */
  offHigh: number | null;
  hv30: number | null;
  dd1y: number | null;
  aboveSma200: boolean | null;
  aboveSma50: boolean | null;
  /** 50-day vs 200-day: "golden" when SMA50 > SMA200. */
  maCross: "golden" | "death" | null;
  supports: Level[];
  resistances: Level[];
};

export function computeTechnicals(bars: Bar[]): Technicals | null {
  const b = bars.filter((x) => fin(x.c) && fin(x.h) && fin(x.l) && fin(x.v) && x.c > 0);
  if (b.length < 60) return null;
  const closes = b.map((x) => x.c);
  const price = closes[closes.length - 1];
  const year = (t: number) => new Date(t * 1000).getUTCFullYear();
  const ytdIdx = b.findIndex((x) => year(x.t) === year(b[b.length - 1].t));
  const w52 = b.slice(-252);
  let loIdx = 0;
  let hi = -Infinity;
  w52.forEach((x, i) => {
    if (x.l < w52[loIdx].l) loIdx = i;
    if (x.h > hi) hi = x.h;
  });
  const lo = w52[loIdx].l;
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const a = atr(b, 14);
  const sr = supportResistance(b);
  return {
    asOf: new Date(b[b.length - 1].t * 1000).toISOString().slice(0, 10),
    price,
    sma50: s50,
    sma200: s200,
    ema21: ema(closes, 21),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    boll: bollinger(closes),
    atr14: a,
    atrPct: a != null ? a / price : null,
    vwma20: vwma(b, 20),
    vwma50: vwma(b, 50),
    vwapYtd: ytdIdx >= 0 && b.length - ytdIdx >= 5 ? anchoredVwap(b, ytdIdx) : null,
    vwapFrom52wLow: anchoredVwap(b, b.length - w52.length + loIdx),
    hi52: hi,
    lo52: lo,
    offHigh: hi > 0 ? (hi - price) / hi : null,
    hv30: historicalVol(closes, 30),
    dd1y: maxDrawdown(closes.slice(-252)),
    aboveSma200: s200 != null ? price > s200 : null,
    aboveSma50: s50 != null ? price > s50 : null,
    maCross: s50 != null && s200 != null ? (s50 > s200 ? "golden" : "death") : null,
    supports: sr.supports,
    resistances: sr.resistances,
  };
}

/** Plain-English reading of RSI (a state, not a prediction). */
export function rsiState(r: number | null): { label: string; tone: "good" | "warn" | "bad" | "neutral" } {
  if (r == null) return { label: "n/a", tone: "neutral" };
  if (r >= 70) return { label: "Overbought: stretched after a run-up", tone: "warn" };
  if (r <= 30) return { label: "Oversold: sold hard recently (can keep falling)", tone: "warn" };
  if (r >= 55) return { label: "Healthy upward momentum", tone: "good" };
  if (r <= 45) return { label: "Soft momentum", tone: "neutral" };
  return { label: "Neutral", tone: "neutral" };
}
