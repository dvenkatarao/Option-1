import { describe, expect, it } from "vitest";
import { providerQuoteIsFresh, snapshotSkipReason } from "../src/lib/option-snapshots";

describe("option quote snapshot capture policy", () => {
  const regularSessionQuote = new Date("2026-10-21T14:00:00.000Z");

  it("accepts a fresh weekday regular-session provider sample", () => {
    expect(snapshotSkipReason(regularSessionQuote, false, new Date("2026-10-21T14:05:00.000Z"))).toBeNull();
  });

  it("skips cached or stale provider responses and holidays reported as closed", () => {
    expect(snapshotSkipReason(regularSessionQuote, true, new Date("2026-10-21T14:05:00.000Z"))).toBe("stale provider response");
    expect(snapshotSkipReason(regularSessionQuote, false, new Date("2026-10-21T14:05:00.000Z"), "CLOSED")).toBe("underlying market state is CLOSED");
    expect(snapshotSkipReason(regularSessionQuote, false, new Date("2026-10-21T14:05:00.000Z"), "REGULAR")).toBeNull();
    expect(snapshotSkipReason(regularSessionQuote, false, new Date("2026-10-21T14:05:00.000Z"), "REGULAR", true)).toBe("provider flagged delayed quotes");
  });

  it("skips quotes outside the regular US session", () => {
    expect(snapshotSkipReason(new Date("2026-10-21T22:00:00.000Z"), false, new Date("2026-10-21T22:00:00.000Z"))).toBe("outside regular US market hours");
    expect(snapshotSkipReason(new Date("2026-10-24T15:00:00.000Z"), false, new Date("2026-10-24T15:00:00.000Z"))).toBe("outside regular US market hours");
  });

  it("accepts missing provider timestamps but excludes stale or invalid contract quotes", () => {
    const now = new Date("2026-10-21T14:05:00.000Z");
    expect(providerQuoteIsFresh(null, now)).toBe(true);
    expect(providerQuoteIsFresh("2026-10-21T13:50:00.000Z", now)).toBe(true);
    expect(providerQuoteIsFresh("2026-10-21T13:40:00.000Z", now)).toBe(false);
    expect(providerQuoteIsFresh("bad timestamp", now)).toBe(false);
  });

  it("rejects old, invalid, or substantially future-dated samples", () => {
    expect(snapshotSkipReason(regularSessionQuote, false, new Date("2026-10-21T14:21:00.000Z"))).toBe("provider response is older than 20 minutes");
    expect(snapshotSkipReason(new Date("invalid"), false, new Date("2026-10-21T14:05:00.000Z"))).toBe("missing fetch timestamp");
    expect(snapshotSkipReason(new Date("2026-10-21T14:05:00.000Z"), false, new Date("2026-10-21T14:00:00.000Z"))).toBe("provider timestamp is in the future");
  });
});
