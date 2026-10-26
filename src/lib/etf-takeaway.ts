import type { QualityResult } from "./quality";
import type { RateTag } from "./etf-rate-sensitivity";

export type TakeawayInput = {
  ticker: string;
  name: string | null;
  category: string | null;
  quality: QualityResult | null;
  expense: number | null;
  yieldTtm: number | null;
  ttmAmount: number | null;
  erosionLevel: string;
  priceRet3y: number | null;
  capFunded: number | null;
  vol3y: number | null;
  dd3y: number | null;
  sharpe: number | null;
  aum: number | null;
  rateTag: RateTag;
  rateLabel: string;
  leveraged: boolean;
  low52w: number | null;
  high52w: number | null;
  fromHigh: number | null;
  sectorTop?: { sector: string; weight: number } | null;
  totalReturn3y: number | null;
};

export type Takeaway = {
  headline: string;
  detail: string;
  suitable: string;
  watch: string;
  tone: "good" | "caution" | "warn";
};

export function buildTakeaway(d: TakeawayInput): Takeaway {
  if (d.leveraged) {
    return {
      headline: `${d.ticker} is a leveraged/inverse trading product — not for buy-and-hold.`,
      detail: `Designed to deliver 2–3× daily exposure; compounding and fees cause decay. Expense ${d.expense != null ? `${(d.expense * 100).toFixed(2)}%` : "N/A"} is a daily drag.`,
      suitable: "Only for short-term tactical trades.",
      watch: "Do not rank for income or core holdings; capped at quality C.",
      tone: "warn",
    };
  }

  const grade = d.quality?.grade ?? null;
  const cheap = d.expense != null ? (d.expense <= 0.0009 ? "very cheap" : d.expense <= 0.002 ? "cheap" : d.expense <= 0.004 ? "average cost" : "expensive") : "cost N/A";
  const yieldLabel = d.yieldTtm != null ? (d.yieldTtm >= 0.06 ? `${(d.yieldTtm * 100).toFixed(1)}% high yield` : d.yieldTtm >= 0.03 ? `${(d.yieldTtm * 100).toFixed(1)}% yield` : `${(d.yieldTtm * 100).toFixed(1)}% yield`) : "yield N/A";
  const erosion = d.erosionLevel;
  const volLabel = d.vol3y != null ? (d.vol3y <= 0.12 ? "low-vol" : d.vol3y <= 0.18 ? "moderate vol" : "high-vol") : "";
  const sizeLabel = d.aum != null ? (d.aum >= 10e9 ? "large & liquid" : d.aum >= 1e9 ? "mid-size" : "small") : "";
  const dd = d.dd3y != null ? `max drawdown ${(d.dd3y * 100).toFixed(0)}%` : "";

  let headline: string;
  if (grade === "A" || grade === "B") {
    headline = `${d.ticker}: ${cheap}, ${yieldLabel}, erosion ${erosion} — quality ${grade ?? "?"}`;
    if (sizeLabel) headline += `, ${sizeLabel}`;
    headline += ".";
  } else if (grade === "C") {
    headline = `${d.ticker}: okay build (${grade}), ${cheap}, ${yieldLabel} — check diversification and trading cost.`;
  } else if (grade === "D" || grade === "F") {
    headline = `${d.ticker}: weak build (grade ${grade}) — ${cheap} but poor on trading/ diversification.`;
  } else {
    headline = `${d.ticker}: ${cheap}, ${yieldLabel}, erosion ${erosion}.`;
  }

  const parts: string[] = [];
  if (d.expense != null) parts.push(`Expense ${(d.expense * 100).toFixed(2)}%`);
  if (d.yieldTtm != null) parts.push(`12-mo distributions ${(d.yieldTtm * 100).toFixed(1)}%`);
  if (erosion !== "None" && erosion !== "n/a") parts.push(`NAV-erosion ${erosion}${d.capFunded != null && d.capFunded > 0 ? ` (~${Math.round(d.capFunded * 100)}% of payout offset by price loss)` : ""}`);
  else parts.push(`No price decay (None)`);
  if (d.totalReturn3y != null) parts.push(`3-yr total return ${(d.totalReturn3y * 100).toFixed(1)}% ann.`);
  if (d.vol3y != null) parts.push(`${volLabel} ${ (d.vol3y*100).toFixed(1)}%`);
  if (dd) parts.push(dd);
  const detail = parts.join(" · ") + ".";

  let suitable = "";
  if (erosion === "Severe") suitable = "Yield looks high because price is funding it — not for Income; compare total return instead.";
  else if (d.yieldTtm != null && d.yieldTtm >= 0.04 && erosion === "None") suitable = "Suits Income / Balanced — yield with price intact.";
  else if (d.rateTag === "defensive") suitable = "Defensive fit — holds up when rates rise; suits preserve/modest risk.";
  else if (d.rateTag === "sensitive") suitable = "Rate-sensitive growth — best with falling real yields and long horizon.";
  else suitable = "General core holding; pair with bonds for balance.";

  let watch = "";
  if (d.sectorTop && d.sectorTop.weight >= 0.25) watch = `Watch: ~${Math.round(d.sectorTop.weight*100)}% in ${d.sectorTop.sector} — concentrated.`;
  else if (erosion === "Moderate" || erosion === "Severe") watch = "Watch: price decay while paying — check 19(a) notices for return-of-capital %.";
  else if (d.vol3y != null && d.vol3y > 0.22) watch = "Watch: high volatility — size position accordingly.";
  else watch = "Watch: track expense + AUM over time; cheap funds tend to stay cheap.";

  const tone: Takeaway["tone"] = erosion === "Severe" || grade === "F" || grade === "D" ? "warn" : erosion === "Moderate" || grade === "C" ? "caution" : "good";

  return { headline, detail, suitable, watch, tone };
}
