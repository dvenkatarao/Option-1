import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const discovery = vi.hoisted(() => ({
  getEffectiveEtfUniverse: vi.fn(),
  getEtfUniverseStatus: vi.fn(),
  refreshEtfUniverse: vi.fn(),
}));
vi.mock("@/lib/etf-universe-discovery", () => discovery);

import { GET, POST } from "@/app/api/etfs/discover/route";

const status = {
  configured: true,
  automatic: false,
  provider: "Polygon/Massive" as const,
  classification: "active U.S.-listed ETFs only",
  discoveredCount: 2,
  curatedCount: 5,
  totalCount: 7,
  fetchedAt: "2026-10-27T12:00:00.000Z",
  stale: false,
  pageCount: 1,
};
const previousKey = process.env.POLYGON_API_KEY;

afterEach(() => {
  if (previousKey === undefined) delete process.env.POLYGON_API_KEY;
  else process.env.POLYGON_API_KEY = previousKey;
});

beforeEach(() => {
  delete process.env.POLYGON_API_KEY;
  discovery.getEffectiveEtfUniverse.mockReset();
  discovery.getEtfUniverseStatus.mockReset().mockResolvedValue(status);
  discovery.refreshEtfUniverse.mockReset();
});

describe("ETF discovery API", () => {
  it("returns status without contacting the provider", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(status);
    expect(discovery.refreshEtfUniverse).not.toHaveBeenCalled();
  });

  it("requires a server-side Massive/Polygon key before forced discovery", async () => {
    const response = await POST();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("POLYGON_API_KEY") });
    expect(discovery.refreshEtfUniverse).not.toHaveBeenCalled();
  });

  it("forces a catalog refresh and reports the bounded-hydration distinction", async () => {
    process.env.POLYGON_API_KEY = "test-only-server-key";
    discovery.refreshEtfUniverse.mockResolvedValue({ data: { tickers: [] }, fetchedAt: status.fetchedAt, stale: false });
    discovery.getEffectiveEtfUniverse.mockResolvedValue({ tickers: ["SPY", "VOO"], status });

    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      universe: status,
      stale: false,
      message: expect.stringContaining("does not hydrate"),
    });
    expect(discovery.refreshEtfUniverse).toHaveBeenCalledWith(true);
    expect(discovery.getEffectiveEtfUniverse).toHaveBeenCalledOnce();
  });

  it("does not expose provider errors when a first discovery fails", async () => {
    process.env.POLYGON_API_KEY = "test-only-server-key";
    discovery.refreshEtfUniverse.mockRejectedValue(new Error("provider secret detail"));

    const response = await POST();
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain("discovery failed");
    expect(data.error).not.toContain("provider secret detail");
  });
});
