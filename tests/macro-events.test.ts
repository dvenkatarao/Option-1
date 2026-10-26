import { describe, expect, it } from "vitest";
import { combineEvents, expiryEventProximity } from "../src/lib/macro-events";

describe("expiryEventProximity", () => {
  const events = combineEvents([{ year: 2026, start: "2026-11-05", end: "2026-11-06", label: "Nov 5-6", hasProjections: false, statementUrl: null, minutesUrl: null }], [{ date: "2026-11-13", time: "08:30 ET", title: "CPI", source: "BLS" }]);
  it("detects expiry within 3d after event", () => {
    const r = expiryEventProximity("2026-11-07", events, 3);
    expect(r.near).toBe(true);
    expect(r.daysAfter).toBe(2);
  });
  it("ignores expiry before event", () => {
    expect(expiryEventProximity("2026-11-04", events, 3).near).toBe(false);
  });
  it("ignores distant expiry", () => {
    expect(expiryEventProximity("2026-12-01", events, 3).near).toBe(false);
  });
});
