/**
 * Display-only US cash session. Does not know exchange holidays —
 * those show as Closed only on weekends here; weekdays still follow the clock.
 * Quotes in this app are delayed; the chrome always says so.
 */

export type UsSession = "open" | "pre" | "after" | "closed";

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const NY_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function nyMinsAndWeekday(d: Date): { mins: number; weekday: string } {
  const p = Object.fromEntries(NY_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return { mins: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday };
}

export function usCashSession(d: Date): { session: UsSession; label: string } {
  const { mins, weekday } = nyMinsAndWeekday(d);
  if (weekday === "Sat" || weekday === "Sun") return { session: "closed", label: "Closed" };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { session: "open", label: "Open" };
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return { session: "pre", label: "Pre-market" };
  if (mins >= 16 * 60 && mins < 20 * 60) return { session: "after", label: "After hours" };
  return { session: "closed", label: "Closed" };
}

export function formatNyClock(d: Date): string {
  return `${NY_CLOCK.format(d)} ET`;
}
