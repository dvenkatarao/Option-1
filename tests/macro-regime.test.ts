import { describe, expect, it } from "vitest";
import { deriveRegime, regimeGuardrails } from "../src/lib/macro-regime";
import type { MacroPoint } from "../src/lib/macro";
import type { PolicyRates, YieldCurve } from "../src/lib/macro";

function pt(id: string, latest: number | null, date = "2026-10-20"): MacroPoint {
  return { def: { id, label: id, unit: "%", transform: "level", group: "Policy & rates", note: "" } as any, latest, date, previous: latest != null ? latest - 0.1 : null, previousDate: date, history: [{ date, value: latest ?? 0 }] as any };
}

describe("deriveRegime", () => {
  it("returns null with no snapshot", () => expect(deriveRegime({ snap: null, curve: null, policy: null })).toBeNull());

  it("labels stress when VIX >=30 or HY >=6", () => {
    const snap = [pt("VIXCLS", 35), pt("BAMLH0A0HYM2", 4), pt("T10Y2Y", 0.5), pt("DGS10", 4), pt("T10YIE", 2)] as MacroPoint[];
    const r = deriveRegime({ snap, curve: null, policy: null });
    expect(r?.label).toBe("stress");
  });

  it("labels tightening when curve inverted and EFFR high", () => {
    const snap = [pt("VIXCLS", 15), pt("BAMLH0A0HYM2", 3), pt("T10Y2Y", -0.4), pt("DGS10", 4.5), pt("T10YIE", 2)] as MacroPoint[];
    const policy: PolicyRates = { effr: { date: "2026-10-20", rate: 4.5, targetFrom: 4.25, targetTo: 4.5 }, sofr: null };
    const r = deriveRegime({ snap, curve: null, policy });
    expect(r?.label).toBe("tightening");
  });

  it("labels easing when curve steep and EFFR low", () => {
    const snap = [pt("VIXCLS", 14), pt("BAMLH0A0HYM2", 3), pt("T10Y2Y", 1.0), pt("DGS10", 3.5), pt("T10YIE", 2)] as MacroPoint[];
    const policy: PolicyRates = { effr: { date: "2026-10-20", rate: 2.5, targetFrom: 2.25, targetTo: 2.5 }, sofr: null };
    const r = deriveRegime({ snap, curve: null, policy });
    expect(r?.label).toBe("easing");
  });

  it("uses curve fallback when T10Y2Y missing", () => {
    const snap = [pt("VIXCLS", 15), pt("BAMLH0A0HYM2", 3), pt("DGS10", 4), pt("T10YIE", 2)] as MacroPoint[];
    const curve: YieldCurve = { asOf: "2026-10-20", yearAgoDate: "2025-10-20", points: [{ label: "10Y", years: 10, now: 4.2, yearAgo: 4.0 }, { label: "2Y", years: 2, now: 4.6, yearAgo: 4.5 }] } as any;
    const policy: PolicyRates = { effr: { date: "2026-10-20", rate: 5, targetFrom: 4.75, targetTo: 5 }, sofr: null };
    const r = deriveRegime({ snap, curve, policy });
    expect(r?.signals.spread10y2y).toBeCloseTo(-0.4);
  });
});

describe("regimeGuardrails", () => {
  it("stress tightens delta and OI", () => {
    const snap = [pt("VIXCLS", 35), pt("BAMLH0A0HYM2", 6.2)] as MacroPoint[];
    const r = deriveRegime({ snap, curve: null, policy: null })!;
    const g = regimeGuardrails(r)!;
    expect(g.deltaMax).toBe(0.2);
    expect(g.minOi).toBe(500);
  });
});
