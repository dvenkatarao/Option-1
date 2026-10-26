export type Obs = { date: string; value: number };

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict parser: anything that is not a FRED CSV for this series (error pages, proxy stubs) throws instead of yielding junk. */
export function parseFredCsv(csv: string, id: string): Obs[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  if (header.length !== 2 || !/^(observation_)?date$/i.test(header[0]) || header[1].toUpperCase() !== id.toUpperCase()) {
    throw new Error(`Unexpected response for FRED series ${id} (not a FRED CSV: "${(lines[0] ?? "").slice(0, 60)}")`);
  }
  const maxDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const out: Obs[] = [];
  for (const line of lines.slice(1)) {
    const [d, v] = line.split(",");
    if (!d || v === undefined || v === "" || v === ".") continue;
    if (!ISO_DATE.test(d) || d > maxDate) throw new Error(`Invalid date "${d}" in FRED series ${id}`);
    const n = Number(v);
    if (Number.isFinite(n)) out.push({ date: d, value: n });
  }
  return out;
}

