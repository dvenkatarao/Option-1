import type { HistoryJson } from "@/db/schema";
import { rsi, sma } from "./technicals";

export type EtfTrendState = "uptrend" | "downtrend" | "mixed" | "insufficient";
export type EtfRsiState = "oversold" | "neutral" | "overbought" | "unavailable";

export type EtfTrendSignal = {
  asOf: string | null;
  bars: number;
  price: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  state: EtfTrendState;
  rsiState: EtfRsiState;
  /** True when the latest close is above the corresponding simple moving average. */
  aboveSma50: boolean | null;
  aboveSma200: boolean | null;
  /** SMA50 above SMA200 is an alignment, not necessarily a recent crossover. */
  movingAverageAlignment: "50d-above-200d" | "50d-below-200d" | null;
  methodology: string;
};

export const ETF_TREND_METHODOLOGY =
  "Uses stored split-adjusted daily closes (not distributions): uptrend = last close and SMA50 above SMA200; downtrend = both below; otherwise mixed. RSI14 uses Wilder smoothing; <=30/ >=70 are oversold/overbought context thresholds. Requires 200 valid closes for a trend state. Descriptive only, not a forecast or trade instruction.";

/** Deterministic trend context from stored ETF history; makes no provider calls. */
export function computeEtfTrendSignal(history: HistoryJson | null | undefined): EtfTrendSignal {
  const valid = (history?.t ?? [])
    .map((t, i) => ({ t, close: history?.c[i] }))
    .filter((bar): bar is { t: number; close: number } =>
      Number.isFinite(bar.t) && typeof bar.close === "number" && Number.isFinite(bar.close) && bar.close > 0,
    )
    .sort((a, b) => a.t - b.t);
  const closes = valid.map((bar) => bar.close);
  const price = closes.at(-1) ?? null;
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const aboveSma50 = price != null && sma50 != null ? price > sma50 : null;
  const aboveSma200 = price != null && sma200 != null ? price > sma200 : null;
  const movingAverageAlignment = sma50 == null || sma200 == null
    ? null
    : sma50 >= sma200 ? "50d-above-200d" : "50d-below-200d";

  let state: EtfTrendState = "insufficient";
  if (price != null && sma50 != null && sma200 != null) {
    if (price > sma200 && sma50 > sma200) state = "uptrend";
    else if (price < sma200 && sma50 < sma200) state = "downtrend";
    else state = "mixed";
  }

  const rsiState: EtfRsiState = rsi14 == null
    ? "unavailable"
    : rsi14 <= 30 ? "oversold" : rsi14 >= 70 ? "overbought" : "neutral";
  const lastTimestamp = valid.at(-1)?.t;

  return {
    asOf: lastTimestamp == null ? null : new Date(lastTimestamp * 1000).toISOString().slice(0, 10),
    bars: closes.length,
    price,
    sma50,
    sma200,
    rsi14,
    state,
    rsiState,
    aboveSma50,
    aboveSma200,
    movingAverageAlignment,
    methodology: ETF_TREND_METHODOLOGY,
  };
}
