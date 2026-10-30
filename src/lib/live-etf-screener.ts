import type { ScreenRow } from "@/types/liveScreener";

export type LiveSortKey =
  | "ticker"
  | "category"
  | "qualityScore"
  | "price"
  | "changePct"
  | "yieldTtm"
  | "lastExDate"
  | "divCagr5y"
  | "expense"
  | "aum"
  | "ytd"
  | "r1y"
  | "r3y"
  | "dd3y"
  | "erosion"
  | "assetClass";

export type LiveSortDirection = "asc" | "desc";
export type LiveErosionFilter = "ALL" | "PRUDENT_ONLY" | "EXCLUDE_SEVERE";

export type LiveScreenerFilters = {
  category: string;
  minYieldPct: number;
  maxExpensePct: number;
  erosion: LiveErosionFilter;
  frequency: string;
};

export const DEFAULT_LIVE_SCREENER_FILTERS: LiveScreenerFilters = {
  category: "ALL",
  minYieldPct: 0,
  maxExpensePct: 1,
  erosion: "ALL",
  frequency: "ALL",
};

const EROSION_RANK: Record<string, number> = { None: 0, Mild: 1, Moderate: 2, Severe: 3 };

export function filterLiveEtfs(rows: ScreenRow[], filters: LiveScreenerFilters): ScreenRow[] {
  return rows.filter((row) => {
    if (filters.category !== "ALL" && row.category !== filters.category) return false;
    if (filters.minYieldPct > 0 && (row.yieldTtm == null || row.yieldTtm * 100 < filters.minYieldPct)) return false;
    if (row.expense == null ? filters.maxExpensePct < 1 : row.expense * 100 > filters.maxExpensePct) return false;

    if (filters.erosion === "PRUDENT_ONLY" && row.erosion !== "None" && row.erosion !== "Mild") return false;
    if (filters.erosion === "EXCLUDE_SEVERE" && row.erosion === "Severe") return false;
    if (filters.frequency !== "ALL" && row.freq !== filters.frequency) return false;
    return true;
  });
}

function sortValue(row: ScreenRow, key: LiveSortKey): number | string | null {
  switch (key) {
    case "ticker": return row.ticker;
    case "category": return row.category;
    case "qualityScore": return row.qualityScore;
    case "price": return row.price;
    case "changePct": return row.changePct;
    case "yieldTtm": return row.yieldTtm;
    case "lastExDate": return row.lastExDate;
    case "divCagr5y": return row.divCagr5y;
    case "expense": return row.expense;
    case "aum": return row.aum;
    case "ytd": return row.ytd;
    case "r1y": return row.r1y;
    case "r3y": return row.r3y;
    case "dd3y": return row.dd3y;
    case "erosion": return EROSION_RANK[row.erosion] ?? null;
    case "assetClass": return row.assetClass;
  }
}

export function sortLiveEtfs(rows: ScreenRow[], key: LiveSortKey, direction: LiveSortDirection): ScreenRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = sortValue(a, key);
    const bValue = sortValue(b, key);
    if (aValue == null && bValue == null) return a.ticker.localeCompare(b.ticker);
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    const comparison = typeof aValue === "string" && typeof bValue === "string"
      ? aValue.localeCompare(bValue, undefined, { sensitivity: "base" })
      : Number(aValue) - Number(bValue);
    return comparison ? comparison * sign : a.ticker.localeCompare(b.ticker);
  });
}
