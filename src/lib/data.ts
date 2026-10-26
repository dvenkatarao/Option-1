import type { EtfRow } from "./etf-service";
import { cachedOrNull } from "./cache";
import { rateTagForEtf } from "./etf-rate-sensitivity";
import { isLeveragedOrInverse } from "./format";
import { fredSeries } from "./macro";
import { sharpe } from "./metrics";
import { assetClassOf } from "./recommend";
import { qualityForRow } from "./quality";
import type { SpreadStat } from "./spread";
import type { ScreenRow } from "@/types/liveScreener";
import type { YahooQuote } from "./yahoo";

/** Risk-free proxy: latest 3-month Treasury constant-maturity yield (FRED DGS3MO), as a decimal. */
export async function getRiskFree() {
  const r = await cachedOrNull<{ rate: number; date: string }>("macro:rf:v1", 3600, async () => {
    const start = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    const obs = await fredSeries("DGS3MO", start);
    const last = obs[obs.length - 1];
    if (!last) throw new Error("no DGS3MO data");
    return { rate: last.value / 100, date: last.date };
  });
  return r ? { rate: r.data.rate, date: r.data.date, fetchedAt: r.fetchedAt } : { rate: null, date: null, fetchedAt: null };
}

export function toScreenRow(r: EtfRow, q: YahooQuote | undefined, rf: number | null, extras: { spread?: SpreadStat | null } = {}): ScreenRow {
  const m = r.metrics!;
  const quality = qualityForRow(r, q, extras.spread);
  const assetClass = assetClassOf(r.category, r.profile?.allocation);
  const rate = rateTagForEtf({ ticker: r.ticker, category: r.category, name: r.name, assetClass });
  return {
    ticker: r.ticker,
    name: r.name,
    category: r.category,
    family: r.family,
    leveraged: isLeveragedOrInverse(r.category, r.name),
    assetClass,
    rateTag: rate.tag,
    rateLabel: rate.label,
    quality: quality.grade,
    qualityScore: quality.score,
    price: q?.price ?? r.lastClose,
    changePct: q?.changePct ?? null,
    expense: r.expenseRatio,
    yieldTtm: m.dividends.ttmYield,
    aum: r.totalAssets ?? q?.netAssets ?? null,
    ytd: m.returns.YTD.total,
    r1y: m.returns["1Y"].total,
    r3y: m.returns["3Y"].total,
    r5y: m.returns["5Y"].total,
    vol3y: m.vol3y,
    dd3y: m.maxDrawdown3y,
    sharpe: sharpe(m, rf),
    erosion: m.erosion.level,
    priceRet3y: m.erosion.priceReturnAnn3y,
    capFunded: m.erosion.capitalFundedShare3y,
    divCagr3y: m.dividends.cagr3y,
    freq: m.dividends.frequency,
  };
}
