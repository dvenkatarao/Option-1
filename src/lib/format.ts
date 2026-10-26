type N = number | null | undefined;

export const NA = "N/A";

export function pct(x: N, dp = 2, sign = false): string {
  if (x == null || !Number.isFinite(x)) return NA;
  return `${sign && x > 0 ? "+" : ""}${(x * 100).toFixed(dp)}%`;
}

/** value already in percent units (e.g. FRED 4.25) */
export function pctPts(x: N, dp = 2, sign = false): string {
  if (x == null || !Number.isFinite(x)) return NA;
  return `${sign && x > 0 ? "+" : ""}${x.toFixed(dp)}%`;
}

/** Format a macro observation: "%" and "pp" units get a suffix, others use grouped numbers. */
export function macroValue(x: N, unit: string, decimals = 2): string {
  if (x == null || !Number.isFinite(x)) return NA;
  if (unit === "%") return `${x.toFixed(decimals)}%`;
  if (unit === "pp") return `${x.toFixed(decimals)} pp`;
  const n = x.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return unit && unit !== "idx" ? `${n} ${unit}` : n;
}

export function num(x: N, dp = 2): string {
  if (x == null || !Number.isFinite(x)) return NA;
  return x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function money(x: N, dp = 2): string {
  if (x == null || !Number.isFinite(x)) return NA;
  return `$${num(x, dp)}`;
}

export function big(x: N): string {
  if (x == null || !Number.isFinite(x)) return NA;
  const a = Math.abs(x);
  if (a >= 1e12) return `$${(x / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  return `$${num(x, 0)}`;
}

export function colorFor(x: N): string {
  if (x == null || !Number.isFinite(x)) return "text-slate-400";
  if (x > 0) return "text-emerald-600";
  if (x < 0) return "text-rose-600";
  return "text-slate-600";
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return NA;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return NA;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return NA;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NA;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return NA;
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const erosionStyle: Record<string, string> = {
  None: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Mild: "bg-amber-50 text-amber-700 ring-amber-200",
  Moderate: "bg-orange-50 text-orange-700 ring-orange-200",
  Severe: "bg-rose-50 text-rose-700 ring-rose-200",
  "n/a": "bg-slate-50 text-slate-500 ring-slate-200",
};

export function isLeveragedOrInverse(category: string | null | undefined, name: string | null | undefined): boolean {
  if (category && /^Trading--/i.test(category)) return true;
  if (name && /\b(2x|3x|-1x|ultra|ultrapro|bull|bear|inverse|leveraged)\b/i.test(name)) return true;
  return false;
}
