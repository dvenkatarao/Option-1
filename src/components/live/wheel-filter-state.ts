export type WheelFilterState = {
  grade: string;
  gradeMatch: "minimum" | "exact";
  sortBy: "score" | "annRoc";
  account: string;
  dteMin: string;
  dteMax: string;
  deltaMin: string;
  deltaMax: string;
  minOi: string;
  maxSpread: string;
  minReturn: string;
  minScore: string;
  earnings: boolean;
  trend: boolean;
  dividendOnly: boolean;
};

/** Keep the dashboard preview and the full live scanner on the same default screen criteria. */
export const DEFAULT_WHEEL_FILTERS: WheelFilterState = {
  grade: "A",
  gradeMatch: "minimum",
  sortBy: "score",
  account: "all",
  dteMin: "21",
  dteMax: "50",
  deltaMin: "0.15",
  deltaMax: "0.3",
  minOi: "100",
  maxSpread: "10",
  minReturn: "8",
  minScore: "15",
  earnings: false,
  trend: false,
  dividendOnly: false,
};

export function serializeWheelFilterState(filterValues: WheelFilterState): string {
  const query = new URLSearchParams({
    preset: filterValues.grade,
    gradeMatch: filterValues.gradeMatch,
    sortBy: filterValues.sortBy,
    acct: filterValues.account,
    dteMin: filterValues.dteMin,
    dteMax: filterValues.dteMax,
    dMin: filterValues.deltaMin,
    dMax: filterValues.deltaMax,
    oi: filterValues.minOi,
    spread: filterValues.maxSpread,
    ret: filterValues.minReturn,
    minScore: filterValues.minScore,
  });
  if (filterValues.earnings) query.set("earn", "1");
  if (filterValues.trend) query.set("trend", "1");
  if (filterValues.dividendOnly) query.set("divOnly", "1");
  return query.toString();
}

export const DEFAULT_WHEEL_FILTER_QUERY = serializeWheelFilterState(DEFAULT_WHEEL_FILTERS);
