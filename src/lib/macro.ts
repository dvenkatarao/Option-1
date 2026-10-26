import { cached, cachedOrNull } from "./cache";
import type { Obs } from "./fred-csv";
import { ISO_DATE, parseFredCsv } from "./fred-csv";
import { SEC_UA, fetchJson, fetchText, mapLimit } from "./http";

/* ------------------------------------------------------------------ */
/* FRED                                                                 */
/* Official API (needs free FRED_API_KEY, 120 req/min) when the key is   */
/* present, otherwise the keyless fredgraph.csv endpoint (verified).     */
/* ------------------------------------------------------------------ */


export async function fredSeries(id: string, startDate: string): Promise<Obs[]> {
  const key = process.env.FRED_API_KEY;
  if (key) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=${startDate}`;
    const j = await fetchJson<{ observations: { date: string; value: string }[] }>(url);
    return j.observations
      .filter((o) => o.value !== "." && o.value !== "")
      .map((o) => ({ date: o.date, value: Number(o.value) }))
      .filter((o) => Number.isFinite(o.value) && ISO_DATE.test(o.date));
  }
  const csv = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${startDate}`, { retries: 2 });
  return parseFredCsv(csv, id);
}

function yearsAgo(y: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - y);
  return d.toISOString().slice(0, 10);
}

type Transform = "level" | "yoy" | "diff";
export type MacroDef = {
  id: string;
  label: string;
  unit: string;
  transform: Transform;
  group: "Policy & rates" | "Inflation" | "Growth & labor" | "Markets & conditions";
  note: string;
  decimals?: number;
  scale?: number;
};

export const MACRO_SERIES: MacroDef[] = [
  { id: "DFF", label: "Effective fed funds rate", unit: "%", transform: "level", group: "Policy & rates", note: "Daily effective federal funds rate (FRED: DFF)" },
  { id: "DGS3MO", label: "3-month Treasury", unit: "%", transform: "level", group: "Policy & rates", note: "Constant-maturity yield, daily (FRED: DGS3MO)" },
  { id: "DGS2", label: "2-year Treasury", unit: "%", transform: "level", group: "Policy & rates", note: "Constant-maturity yield, daily (FRED: DGS2)" },
  { id: "DGS10", label: "10-year Treasury", unit: "%", transform: "level", group: "Policy & rates", note: "Constant-maturity yield, daily (FRED: DGS10)" },
  { id: "T10Y2Y", label: "10Y minus 2Y spread", unit: "pp", transform: "level", group: "Policy & rates", note: "Yield-curve slope; negative = inverted (FRED: T10Y2Y)" },
  { id: "MORTGAGE30US", label: "30-yr mortgage rate", unit: "%", transform: "level", group: "Policy & rates", note: "Freddie Mac PMMS weekly (FRED: MORTGAGE30US)" },
  { id: "CPIAUCSL", label: "CPI inflation (YoY)", unit: "%", transform: "yoy", group: "Inflation", note: "All items CPI-U, SA, year-over-year computed from index (FRED: CPIAUCSL)" },
  { id: "CPILFESL", label: "Core CPI (YoY)", unit: "%", transform: "yoy", group: "Inflation", note: "CPI less food & energy, YoY computed (FRED: CPILFESL)" },
  { id: "PCEPILFE", label: "Core PCE (YoY)", unit: "%", transform: "yoy", group: "Inflation", note: "Fed's preferred gauge, YoY computed (FRED: PCEPILFE)" },
  { id: "T10YIE", label: "10Y breakeven inflation", unit: "%", transform: "level", group: "Inflation", note: "Market-implied inflation expectation (FRED: T10YIE)" },
  { id: "UNRATE", label: "Unemployment rate", unit: "%", transform: "level", group: "Growth & labor", note: "BLS household survey (FRED: UNRATE)" },
  { id: "PAYEMS", label: "Nonfarm payrolls (monthly change)", unit: "k jobs", transform: "diff", group: "Growth & labor", note: "Month-over-month change of total nonfarm employment (FRED: PAYEMS)", decimals: 0 },
  { id: "ICSA", label: "Initial jobless claims", unit: "", transform: "level", group: "Growth & labor", note: "Weekly, SA (FRED: ICSA)", decimals: 0 },
  { id: "A191RL1Q225SBEA", label: "Real GDP growth (QoQ ann.)", unit: "%", transform: "level", group: "Growth & labor", note: "BEA, quarterly annualised (FRED: A191RL1Q225SBEA)" },
  { id: "UMCSENT", label: "Consumer sentiment (UMich)", unit: "idx", transform: "level", group: "Growth & labor", note: "University of Michigan (FRED: UMCSENT)", decimals: 1 },
  { id: "VIXCLS", label: "VIX (close)", unit: "", transform: "level", group: "Markets & conditions", note: "CBOE volatility index close (FRED: VIXCLS)" },
  { id: "BAMLH0A0HYM2", label: "High-yield credit spread", unit: "pp", transform: "level", group: "Markets & conditions", note: "ICE BofA US HY OAS (FRED: BAMLH0A0HYM2)" },
  { id: "DTWEXBGS", label: "Broad US dollar index", unit: "idx", transform: "level", group: "Markets & conditions", note: "Fed trade-weighted broad index (FRED: DTWEXBGS)", decimals: 1 },
  { id: "DCOILWTICO", label: "WTI crude oil", unit: "$/bbl", transform: "level", group: "Markets & conditions", note: "Spot price, daily (FRED: DCOILWTICO)" },
  { id: "WALCL", label: "Fed balance sheet", unit: "$T", transform: "level", group: "Markets & conditions", note: "Total assets, weekly; shown in $ trillions (FRED: WALCL)", scale: 1e-6, decimals: 2 },
];

export type MacroPoint = {
  def: MacroDef;
  latest: number | null;
  date: string | null;
  previous: number | null;
  previousDate: string | null;
  history: Obs[];
  error?: string;
};

function transformSeries(obs: Obs[], def: MacroDef): Obs[] {
  const scale = def.scale ?? 1;
  if (def.transform === "level") return obs.map((o) => ({ date: o.date, value: o.value * scale }));
  if (def.transform === "diff") {
    const out: Obs[] = [];
    for (let i = 1; i < obs.length; i++) out.push({ date: obs[i].date, value: obs[i].value - obs[i - 1].value });
    return out;
  }
  // YoY: match same month one year earlier
  const out: Obs[] = [];
  for (let i = 12; i < obs.length; i++) {
    const prev = obs[i - 12];
    if (prev.value > 0) out.push({ date: obs[i].date, value: (obs[i].value / prev.value - 1) * 100 });
  }
  return out;
}

async function loadMacro(def: MacroDef): Promise<MacroPoint> {
  try {
    const obs = await fredSeries(def.id, yearsAgo(3));
    const t = transformSeries(obs, def);
    const last = t[t.length - 1];
    const prev = t[t.length - 2];
    // keep history compact for charts
    const history = t.length > 160 ? t.filter((_, i) => i % Math.ceil(t.length / 160) === 0 || i === t.length - 1) : t;
    return {
      def,
      latest: last?.value ?? null,
      date: last?.date ?? null,
      previous: prev?.value ?? null,
      previousDate: prev?.date ?? null,
      history,
    };
  } catch (e) {
    return { def, latest: null, date: null, previous: null, previousDate: null, history: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getMacroSnapshot() {
  return cachedOrNull("macro:snapshot:v3", 3600, async () => {
    const pts = await mapLimit(MACRO_SERIES, 6, loadMacro);
    if (pts.every((p) => p.latest == null)) throw new Error("FRED unreachable");
    return pts;
  });
}

const CURVE: { id: string; label: string; years: number }[] = [
  { id: "DGS1MO", label: "1M", years: 1 / 12 },
  { id: "DGS3MO", label: "3M", years: 0.25 },
  { id: "DGS6MO", label: "6M", years: 0.5 },
  { id: "DGS1", label: "1Y", years: 1 },
  { id: "DGS2", label: "2Y", years: 2 },
  { id: "DGS3", label: "3Y", years: 3 },
  { id: "DGS5", label: "5Y", years: 5 },
  { id: "DGS7", label: "7Y", years: 7 },
  { id: "DGS10", label: "10Y", years: 10 },
  { id: "DGS20", label: "20Y", years: 20 },
  { id: "DGS30", label: "30Y", years: 30 },
];

export type YieldCurve = { asOf: string; points: { label: string; years: number; now: number | null; yearAgo: number | null }[]; yearAgoDate: string | null };

export async function getYieldCurve() {
  return cachedOrNull<YieldCurve>("macro:curve:v2", 3600, async () => {
    const start = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
    const all = await mapLimit(CURVE, 6, async (c) => ({ c, obs: await fredSeries(c.id, start) }));
    const dates = all.flatMap((x) => (x.obs.length ? [x.obs[x.obs.length - 1].date] : []));
    if (!dates.length) throw new Error("no curve data");
    const asOf = dates.sort().slice(-1)[0];
    const target = new Date(new Date(asOf).getTime() - 365 * 86400000).toISOString().slice(0, 10);
    let yearAgoDate: string | null = null;
    const points = all.map(({ c, obs }) => {
      const now = obs.find((o) => o.date === asOf)?.value ?? null;
      const before = [...obs].reverse().find((o) => o.date <= target);
      if (before && (!yearAgoDate || before.date > yearAgoDate)) yearAgoDate = before.date;
      return { label: c.label, years: c.years, now, yearAgo: before?.value ?? null };
    });
    return { asOf, points, yearAgoDate };
  });
}

/* ------------------------------------------------------------------ */
/* NY Fed reference rates (official, keyless)                            */
/* ------------------------------------------------------------------ */
export type PolicyRates = {
  effr: { date: string; rate: number; targetFrom: number | null; targetTo: number | null } | null;
  sofr: { date: string; rate: number } | null;
};

export async function getPolicyRates() {
  return cachedOrNull<PolicyRates>("macro:policy:v1", 3600, async () => {
    const [e, s] = await Promise.allSettled([
      fetchJson<{ refRates: { effectiveDate: string; percentRate: number; targetRateFrom?: number; targetRateTo?: number }[] }>(
        "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json",
      ),
      fetchJson<{ refRates: { effectiveDate: string; percentRate: number }[] }>(
        "https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json",
      ),
    ]);
    const er = e.status === "fulfilled" ? e.value.refRates?.[0] : null;
    const sr = s.status === "fulfilled" ? s.value.refRates?.[0] : null;
    if (!er && !sr) throw new Error("NY Fed unreachable");
    return {
      effr: er ? { date: er.effectiveDate, rate: er.percentRate, targetFrom: er.targetRateFrom ?? null, targetTo: er.targetRateTo ?? null } : null,
      sofr: sr ? { date: sr.effectiveDate, rate: sr.percentRate } : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* FOMC calendar - parsed from federalreserve.gov/monetarypolicy/fomccalendars.htm */
/* ------------------------------------------------------------------ */
export type FomcMeeting = {
  year: number;
  start: string;
  end: string;
  label: string;
  hasProjections: boolean;
  statementUrl: string | null;
  minutesUrl: string | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function getFomcCalendar() {
  return cachedOrNull<FomcMeeting[]>("macro:fomc:v1", 6 * 3600, async () => {
    const html = await fetchText("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", { retries: 2 });
    const panels = html.split('<div class="panel panel-default">').slice(1);
    const out: FomcMeeting[] = [];
    const thisYear = new Date().getUTCFullYear();
    for (const panel of panels) {
      const ym = panel.match(/(\d{4}) FOMC Meetings/);
      if (!ym) continue;
      const year = Number(ym[1]);
      if (year < thisYear - 1 || year > thisYear + 1) continue;
      const rows = panel.split(/class="row fomc-meeting/).slice(1);
      for (const row of rows) {
        const mm = row.match(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>/);
        const dm = row.match(/fomc-meeting__date[^>]*>([^<]+)</);
        if (!mm || !dm) continue;
        const monthParts = mm[1].split("/").map((s) => MONTHS.indexOf(s.trim().toLowerCase().slice(0, 3)));
        if (monthParts.some((x) => x < 0)) continue;
        const hasStar = dm[1].includes("*");
        const days = dm[1].replace(/[^0-9\-–]/g, "").split(/[-–]/).map(Number);
        if (!days[0]) continue;
        const sm = monthParts[0];
        const startDay = days[0];
        const endDay = days[1] ?? days[0];
        const em = monthParts[1] ?? (endDay < startDay ? sm + 1 : sm);
        const stmt = row.match(/href="(\/newsevents\/pressreleases\/monetary\d+a\.htm)"/);
        const minutes = row.match(/href="(\/monetarypolicy\/fomcminutes\d+\.htm)"/);
        out.push({
          year,
          start: ymd(year, sm, startDay),
          end: ymd(em > 11 ? year + 1 : year, em % 12, endDay),
          label: `${mm[1].trim()} ${dm[1].replace("*", "").trim()}, ${year}`,
          hasProjections: hasStar,
          statementUrl: stmt ? `https://www.federalreserve.gov${stmt[1]}` : null,
          minutesUrl: minutes ? `https://www.federalreserve.gov${minutes[1]}` : null,
        });
      }
    }
    if (!out.length) throw new Error("FOMC calendar parse returned no meetings (page structure may have changed)");
    return out.sort((a, b) => a.start.localeCompare(b.start));
  });
}

/* ------------------------------------------------------------------ */
/* BLS release schedule (official ICS feed, keyless)                     */
/* ------------------------------------------------------------------ */
export type ScheduledRelease = { date: string; time: string | null; title: string; source: string };

export async function getBlsSchedule() {
  return cachedOrNull<ScheduledRelease[]>("macro:bls-ics:v1", 6 * 3600, async () => {
    const ics = await fetchText("https://www.bls.gov/schedule/news_release/bls.ics", { headers: { "User-Agent": SEC_UA }, retries: 2 });
    const unfolded = ics.replace(/\r?\n[ \t]/g, "");
    const events = unfolded.split("BEGIN:VEVENT").slice(1);
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    const out: ScheduledRelease[] = [];
    for (const ev of events) {
      const dt = ev.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
      const sm = ev.match(/SUMMARY:(.*)/);
      if (!dt || !sm) continue;
      const date = `${dt[1]}-${dt[2]}-${dt[3]}`;
      if (date < today || date > horizon) continue;
      out.push({
        date,
        time: dt[4] ? `${dt[4]}:${dt[5]} ET` : null,
        title: sm[1].replace(/\\,/g, ",").replace(/\r/g, "").trim(),
        source: "BLS",
      });
    }
    return out.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  });
}

export { cached };

export type { Obs };
