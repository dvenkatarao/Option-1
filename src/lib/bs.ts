/** Black-Scholes helpers (European approximation; US equity options can be exercised early, which this ignores). */

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf; max error ~1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export type BsInput = { type: "put" | "call"; spot: number; strike: number; years: number; iv: number; rate: number; divYield?: number };

export function bsD1({ spot, strike, years, iv, rate, divYield = 0 }: BsInput): number | null {
  if (!(spot > 0 && strike > 0 && years > 0 && iv > 0)) return null;
  return (Math.log(spot / strike) + (rate - divYield + (iv * iv) / 2) * years) / (iv * Math.sqrt(years));
}

/** Option delta (calls 0..1, puts -1..0). Returns null when inputs are unusable. */
export function bsDelta(inp: BsInput): number | null {
  const d1 = bsD1(inp);
  if (d1 == null) return null;
  const disc = Math.exp(-(inp.divYield ?? 0) * inp.years);
  return inp.type === "call" ? disc * normCdf(d1) : disc * (normCdf(d1) - 1);
}
