/** Pure mapping from Yahoo quoteSummary + daily bars to the stored stock record. Missing values stay null. */
import type { StockEventsJson } from "@/db/schema";
import type { StockInputs } from "./stock-quality";
import type { Technicals } from "./technicals";

type Raw = { raw?: number } | number | null | undefined;
const r = (x: Raw): number | null => {
  const v = x && typeof x === "object" ? x.raw : x;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const day = (unix: number | null) => (unix != null && unix > 0 ? new Date(unix * 1000).toISOString().slice(0, 10) : null);

export type ParsedStock = { name: string | null; sector: string | null; industry: string | null; marketCap: number | null; fundamentals: StockInputs; events: StockEventsJson };

export function parseStockSummary(qs: Record<string, any>, tech: Technicals | null): ParsedStock {
  const fd = qs.financialData ?? {};
  const ks = qs.defaultKeyStatistics ?? {};
  const sd = qs.summaryDetail ?? {};
  const ce = qs.calendarEvents ?? {};
  const pr = qs.price ?? {};
  const ap = qs.assetProfile ?? {};

  const marketCap = r(pr.marketCap) ?? r(sd.marketCap);
  // Yahoo reports debt/equity as a percentage (154 = 1.54x).
  const de = r(fd.debtToEquity);
  const dates: number[] = (ce.earnings?.earningsDate ?? []).map((d: Raw) => r(d)).filter((x: number | null): x is number => x != null).sort((a: number, b: number) => a - b);
  const price = tech?.price ?? r(fd.currentPrice) ?? r(pr.regularMarketPrice);
  const fundamentals: StockInputs = {
    price,
    marketCap,
    beta: r(sd.beta) ?? r(ks.beta),
    forwardPE: r(sd.forwardPE) ?? r(ks.forwardPE),
    trailingPE: r(sd.trailingPE),
    pegRatio: r(ks.pegRatio),
    operatingMargin: r(fd.operatingMargins),
    profitMargin: r(fd.profitMargins),
    roe: r(fd.returnOnEquity),
    freeCashflow: r(fd.freeCashflow),
    totalRevenue: r(fd.totalRevenue),
    debtToEquity: de != null ? de / 100 : null,
    totalDebt: r(fd.totalDebt),
    totalCash: r(fd.totalCash),
    ebitda: r(fd.ebitda),
    currentRatio: r(fd.currentRatio),
    recMean: r(fd.recommendationMean),
    analystCount: r(fd.numberOfAnalystOpinions),
    targetMean: r(fd.targetMeanPrice),
    dd1y: tech?.dd1y ?? null,
  };
  const events: StockEventsJson = {
    nextEarnings: day(dates[0] ?? null),
    // Yahoo lists two dates (a window) while the company has not confirmed the date.
    earningsEstimated: dates.length > 1 && dates[dates.length - 1] - dates[0] > 86_400,
    exDividend: day(r(ce.exDividendDate) ?? r(sd.exDividendDate)),
    dividendPerShare: r(sd.dividendRate) ?? r(sd.trailingAnnualDividendRate),
    dividendYield: r(sd.dividendYield) ?? r(sd.trailingAnnualDividendYield),
  };
  return {
    name: pr.longName ?? pr.shortName ?? null,
    sector: ap.sector ?? null,
    industry: ap.industry ?? null,
    marketCap,
    fundamentals,
    events,
  };
}
