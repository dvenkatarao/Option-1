/**
 * Pure helpers for trading-spread history (no database access, so they are unit-testable).
 * Spread = (ask - bid) / midpoint, sampled from delayed quotes during regular US market hours.
 */

export const SPREAD_MIN_SAMPLES = 20;
export const SPREAD_MIN_DAYS = 5;
/** Samples wider than this are treated as bad quotes, not real spreads. */
export const MAX_REL_SPREAD = 0.1;

export type SpreadStat = { median: number; n: number; days: number };

/** Median relative spread, only once enough samples over enough days exist to be meaningful. */
export function usableSpread(s: SpreadStat | null | undefined): number | null {
  if (!s || !Number.isFinite(s.median)) return null;
  return s.n >= SPREAD_MIN_SAMPLES && s.days >= SPREAD_MIN_DAYS ? s.median : null;
}

export function relSpread(bid: number | null | undefined, ask: number | null | undefined): number | null {
  if (typeof bid !== "number" || typeof ask !== "number" || !(bid > 0) || !(ask >= bid)) return null;
  const r = (ask - bid) / ((ask + bid) / 2);
  return r <= MAX_REL_SPREAD ? r : null;
}

/** Start of the N-minute bucket containing d (UTC). Used as part of the snapshot primary key. */
export function bucketStart(d: Date, minutes = 30): Date {
  const ms = minutes * 60_000;
  return new Date(Math.floor(d.getTime() / ms) * ms);
}

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * Mon-Fri 09:35-15:55 New York time. The first and last minutes are skipped because opening/closing
 * auction quotes are unrepresentative. Holidays are handled by the caller (quote marketState must be REGULAR).
 */
export function isUsMarketHours(d: Date): boolean {
  const p = Object.fromEntries(NY.formatToParts(d).map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const mins = Number(p.hour) * 60 + Number(p.minute);
  return mins >= 9 * 60 + 35 && mins < 15 * 60 + 55;
}
