import { describe, expect, it } from "vitest";
import { MAX_REL_SPREAD, bucketStart, isUsMarketHours, relSpread, usableSpread } from "@/lib/spread";

describe("relSpread", () => {
  it("computes (ask-bid)/mid", () => {
    expect(relSpread(99.99, 100.01)).toBeCloseTo(0.0002, 6);
  });
  it("rejects missing, zero, crossed and absurdly wide quotes", () => {
    expect(relSpread(0, 10)).toBeNull();
    expect(relSpread(null, 10)).toBeNull();
    expect(relSpread(10, 9)).toBeNull();
    expect(relSpread(50, 100)).toBeNull();
    expect(MAX_REL_SPREAD).toBe(0.1);
  });
});

describe("usableSpread", () => {
  it("needs 20 samples over 5 days", () => {
    expect(usableSpread({ median: 0.001, n: 19, days: 9 })).toBeNull();
    expect(usableSpread({ median: 0.001, n: 60, days: 4 })).toBeNull();
    expect(usableSpread({ median: 0.001, n: 20, days: 5 })).toBe(0.001);
    expect(usableSpread(null)).toBeNull();
    expect(usableSpread({ median: NaN, n: 50, days: 9 })).toBeNull();
  });
});

describe("bucketStart", () => {
  it("floors to 30 minutes", () => {
    expect(bucketStart(new Date("2026-10-20T14:47:31Z")).toISOString()).toBe("2026-10-20T14:30:00.000Z");
    expect(bucketStart(new Date("2026-10-20T14:30:00Z")).toISOString()).toBe("2026-10-20T14:30:00.000Z");
  });
});

describe("isUsMarketHours (New York time, 09:35-15:55 on weekdays)", () => {
  it("summer (EDT, UTC-4)", () => {
    expect(isUsMarketHours(new Date("2026-10-20T14:00:00Z"))).toBe(true); // Tue 10:00 ET
    expect(isUsMarketHours(new Date("2026-10-20T13:30:00Z"))).toBe(false); // 09:30 ET, opening auction
    expect(isUsMarketHours(new Date("2026-10-20T13:35:00Z"))).toBe(true); // 09:35 ET
    expect(isUsMarketHours(new Date("2026-10-20T19:54:00Z"))).toBe(true); // 15:54 ET
    expect(isUsMarketHours(new Date("2026-10-20T19:55:00Z"))).toBe(false); // 15:55 ET
    expect(isUsMarketHours(new Date("2026-10-20T21:30:00Z"))).toBe(false); // 17:30 ET
  });
  it("winter (EST, UTC-5)", () => {
    expect(isUsMarketHours(new Date("2026-12-15T15:00:00Z"))).toBe(true); // Tue 10:00 ET
    expect(isUsMarketHours(new Date("2026-12-15T14:00:00Z"))).toBe(false); // 09:00 ET
  });
  it("weekends are closed", () => {
    expect(isUsMarketHours(new Date("2026-10-24T15:00:00Z"))).toBe(false); // Saturday
    expect(isUsMarketHours(new Date("2026-10-25T15:00:00Z"))).toBe(false); // Sunday
  });
});
