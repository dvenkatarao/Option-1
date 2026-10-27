import { beforeEach, describe, expect, it, vi } from "vitest";

const { computeCoverage } = vi.hoisted(() => ({ computeCoverage: vi.fn() }));
vi.mock("@/lib/coverage", () => ({ computeCoverage }));

import { GET } from "@/app/api/coverage/route";

describe("GET /api/coverage", () => {
  beforeEach(() => computeCoverage.mockReset());

  it("returns the coverage report consumed by the Research panel", async () => {
    const report = {
      generatedAt: "2026-10-27T12:00:00.000Z",
      universeSize: 120,
      hydrated: 85,
      fields: [],
      readiness: [],
    };
    computeCoverage.mockResolvedValue(report);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(report);
    expect(computeCoverage).toHaveBeenCalledOnce();
  });
});
