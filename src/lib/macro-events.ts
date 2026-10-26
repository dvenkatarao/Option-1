import type { FomcMeeting, ScheduledRelease } from "./macro";

/**
 * Merge FOMC + BLS calendars into a normalized event list, and check
 * whether an option expiry falls within N days after an event.
 */

export type MacroEvent = { kind: "FOMC" | "BLS"; date: string; title: string; hasProjections?: boolean };

export function combineEvents(fomc: FomcMeeting[] | null, bls: ScheduledRelease[] | null): MacroEvent[] {
  const out: MacroEvent[] = [];
  if (fomc) for (const m of fomc) out.push({ kind: "FOMC", date: m.start, title: `FOMC ${m.label}`, hasProjections: m.hasProjections });
  if (bls) for (const b of bls) out.push({ kind: "BLS", date: b.date, title: b.title });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function expiryEventProximity(
  expiryIso: string,
  events: MacroEvent[],
  windowDays = 3,
): { near: boolean; event: MacroEvent | null; daysAfter: number | null } {
  if (!expiryIso || !events.length) return { near: false, event: null, daysAfter: null };
  const expiryTime = Date.parse(`${expiryIso}T00:00:00Z`);
  let best: MacroEvent | null = null;
  let bestDays = Infinity;
  for (const e of events) {
    const et = Date.parse(`${e.date}T00:00:00Z`);
    const diffDays = Math.round((expiryTime - et) / 86_400_000);
    // Event just before expiry: 0 <= diff <= window
    if (diffDays >= 0 && diffDays <= windowDays && diffDays < bestDays) {
      best = e;
      bestDays = diffDays;
    }
  }
  if (best) return { near: true, event: best, daysAfter: bestDays };
  return { near: false, event: null, daysAfter: null };
}

export function upcomingWithin(events: MacroEvent[], todayIso: string, days = 5): MacroEvent[] {
  const t = Date.parse(`${todayIso}T00:00:00Z`);
  return events.filter((e) => {
    const et = Date.parse(`${e.date}T00:00:00Z`);
    const d = Math.round((et - t) / 86_400_000);
    return d >= 0 && d <= days;
  });
}
