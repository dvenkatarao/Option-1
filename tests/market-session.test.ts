import { describe, expect, it } from "vitest";
import { formatNyClock, usCashSession } from "@/lib/market-session";

describe("usCashSession (New York time)", () => {
  it("summer (EDT, UTC-4)", () => {
    expect(usCashSession(new Date("2026-10-20T13:29:00Z")).session).toBe("pre"); // 09:29 ET
    expect(usCashSession(new Date("2026-10-20T13:30:00Z")).session).toBe("open"); // 09:30 ET
    expect(usCashSession(new Date("2026-10-20T19:59:00Z")).session).toBe("open"); // 15:59 ET
    expect(usCashSession(new Date("2026-10-20T20:00:00Z")).session).toBe("after"); // 16:00 ET
    expect(usCashSession(new Date("2026-10-21T00:00:00Z")).session).toBe("closed"); // 20:00 ET
    expect(usCashSession(new Date("2026-10-20T08:00:00Z")).session).toBe("pre"); // 04:00 ET
    expect(usCashSession(new Date("2026-10-20T07:59:00Z")).session).toBe("closed"); // 03:59 ET
  });

  it("winter (EST, UTC-5)", () => {
    expect(usCashSession(new Date("2026-12-15T14:30:00Z")).session).toBe("open"); // 09:30 ET
    expect(usCashSession(new Date("2026-12-15T14:29:00Z")).session).toBe("pre"); // 09:29 ET
    expect(usCashSession(new Date("2026-12-15T21:00:00Z")).session).toBe("after"); // 16:00 ET
  });

  it("weekends are closed", () => {
    expect(usCashSession(new Date("2026-10-24T15:00:00Z")).label).toBe("Closed");
    expect(usCashSession(new Date("2026-10-25T15:00:00Z")).label).toBe("Closed");
  });

  it("labels match session", () => {
    expect(usCashSession(new Date("2026-10-20T14:00:00Z")).label).toBe("Open");
    expect(usCashSession(new Date("2026-10-20T12:00:00Z")).label).toBe("Pre-market");
    expect(usCashSession(new Date("2026-10-20T21:00:00Z")).label).toBe("After hours");
  });
});

describe("formatNyClock", () => {
  it("appends ET", () => {
    expect(formatNyClock(new Date("2026-10-20T14:00:00Z"))).toMatch(/ET$/);
  });
});
