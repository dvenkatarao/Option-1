import { XMLParser } from "fast-xml-parser";
import { cachedOrNull, type Cached } from "./cache";
import { BROWSER_UA, SEC_UA, fetchJson, fetchText } from "./http";

export type NewsItem = {
  title: string;
  link: string;
  date: string | null;
  summary: string | null;
  source: string;
  tag?: string;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", cdataPropName: "__cdata", trimValues: true });

function text(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    if ("__cdata" in o) return text(o.__cdata);
    if ("#text" in o) return text(o["#text"]);
  }
  return "";
}

function stripHtml(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseFeed(xml: string, source: string, tag?: string): NewsItem[] {
  const j = parser.parse(xml.replace(/^\uFEFF/, ""));
  const items: NewsItem[] = [];
  const rssItems = j?.rss?.channel?.item;
  if (rssItems) {
    for (const it of Array.isArray(rssItems) ? rssItems : [rssItems]) {
      const link = text(it.link) || text(it.guid);
      items.push({
        title: stripHtml(text(it.title)),
        link,
        date: toIso(text(it.pubDate) || text(it["dc:date"])),
        summary: stripHtml(text(it.description)).slice(0, 280) || null,
        source,
        tag: tag ?? (text(it.category) || undefined),
      });
    }
  }
  const atom = j?.feed?.entry;
  if (atom) {
    for (const it of Array.isArray(atom) ? atom : [atom]) {
      const link = typeof it.link === "object" ? ((it.link as Record<string, string>)["@_href"] ?? "") : text(it.link);
      items.push({
        title: stripHtml(text(it.title)),
        link,
        date: toIso(text(it.updated) || text(it.published)),
        summary: stripHtml(text(it.summary)).slice(0, 280) || null,
        source,
        tag,
      });
    }
  }
  return items.filter((i) => i.title && i.link);
}

type FeedDef = { id: string; source: string; tag: string; url: string; sec?: boolean };

export const MACRO_FEEDS: FeedDef[] = [
  { id: "fed-monetary", source: "Federal Reserve", tag: "Monetary policy / FOMC", url: "https://www.federalreserve.gov/feeds/press_monetary.xml" },
  { id: "fed-all", source: "Federal Reserve", tag: "Press release", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { id: "fed-speeches", source: "Federal Reserve", tag: "Speech / testimony", url: "https://www.federalreserve.gov/feeds/speeches.xml" },
  { id: "sec-press", source: "SEC", tag: "Regulation", url: "https://www.sec.gov/news/pressreleases.rss", sec: true },
  { id: "bea", source: "BEA", tag: "GDP / PCE / trade data", url: "https://apps.bea.gov/rss/rss.xml" },
];

async function loadFeed(f: FeedDef): Promise<NewsItem[]> {
  const xml = await fetchText(f.url, { headers: f.sec ? { "User-Agent": SEC_UA } : {}, retries: 1 });
  return parseFeed(xml, f.source, f.tag);
}

export type FeedStatus = { id: string; source: string; ok: boolean; stale: boolean; fetchedAt: string | null; count: number };

export async function getMacroNews(limit = 40): Promise<{ items: NewsItem[]; status: FeedStatus[] }> {
  const results = await Promise.all(
    MACRO_FEEDS.map(async (f) => {
      const r = await cachedOrNull(`news:${f.id}`, 600, () => loadFeed(f));
      return { f, r };
    }),
  );
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const { r } of results) {
    for (const it of r?.data ?? []) {
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      items.push(it);
    }
  }
  items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return {
    items: items.slice(0, limit),
    status: results.map(({ f, r }) => ({
      id: f.id,
      source: f.source,
      ok: !!r,
      stale: r?.stale ?? false,
      fetchedAt: r?.fetchedAt ?? null,
      count: r?.data.length ?? 0,
    })),
  };
}

/** Yahoo Finance headline RSS (keyless) for a ticker or index symbol. */
export async function getSymbolNews(symbol: string, limit = 12): Promise<Cached<NewsItem[]> | null> {
  const r = await cachedOrNull(`news:yahoo:${symbol}`, 600, async () => {
    const xml = await fetchText(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
      { headers: { "User-Agent": BROWSER_UA } },
    );
    return parseFeed(xml, "Yahoo Finance", symbol);
  });
  if (!r) return null;
  return { ...r, data: r.data.slice(0, limit) };
}

/* ---------------- SEC EDGAR: earnings releases & company announcements ---------------- */

export type Filing = {
  company: string;
  tickers: string[];
  filed: string;
  items: string[];
  form: string;
  url: string;
};

type FtsHit = {
  _id: string;
  _source: { ciks?: string[]; display_names?: string[]; file_date: string; items?: string[]; form: string; adsh: string };
};

function parseDisplay(d: string) {
  const name = d.replace(/\s*\(CIK[^)]*\)\s*$/, "").replace(/\s*\([A-Z0-9,\-\s.]+\)\s*$/, "").trim();
  const tk = d.match(/\(([A-Z0-9,\-\s.]+)\)\s*\(CIK/);
  const tickers = tk ? tk[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  return { name, tickers };
}

/** 8-K filings carrying Item 2.02 (Results of Operations) = earnings releases, straight from SEC EDGAR full-text search. */
export async function getRecentEarningsReleases(days = 7) {
  return cachedOrNull<Filing[]>(`edgar:earnings:${days}`, 900, async () => {
    const end = new Date();
    const start = new Date(Date.now() - days * 86400000);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22Item%202.02%22&forms=8-K&dateRange=custom&startdt=${f(start)}&enddt=${f(end)}`;
    const j = await fetchJson<{ hits: { hits: FtsHit[] } }>(url, { headers: { "User-Agent": SEC_UA }, retries: 2 });
    const out: Filing[] = [];
    for (const h of j.hits.hits) {
      const s = h._source;
      if (!s.items?.includes("2.02")) continue;
      const cik = s.ciks?.[0];
      const file = h._id.split(":")[1];
      if (!cik || !file) continue;
      const { name, tickers } = parseDisplay(s.display_names?.[0] ?? "");
      out.push({
        company: name || "Unknown filer",
        tickers,
        filed: s.file_date,
        items: s.items ?? [],
        form: s.form,
        url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${s.adsh.replace(/-/g, "")}/${file}`,
      });
    }
    return out.sort((a, b) => b.filed.localeCompare(a.filed));
  });
}

/** Latest 8-K current reports (company announcements) via EDGAR Atom feed. */
export async function getLatest8Ks(count = 40) {
  return cachedOrNull<NewsItem[]>("edgar:latest8k", 300, async () => {
    const xml = await fetchText(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=${count}&output=atom`,
      { headers: { "User-Agent": SEC_UA } },
    );
    return parseFeed(xml, "SEC EDGAR", "8-K");
  });
}

/* ---------------- Optional keyed providers (only active when env var is set) ---------------- */

export type EarningsEvent = { symbol: string; date: string; hour: string | null; epsEstimate: number | null; revenueEstimate: number | null };

export async function getUpcomingEarnings() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { enabled: false as const, data: null };
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const r = await cachedOrNull<EarningsEvent[]>("finnhub:earnings", 3600, async () => {
    const j = await fetchJson<{ earningsCalendar: { symbol: string; date: string; hour?: string; epsEstimate?: number | null; revenueEstimate?: number | null }[] }>(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`,
    );
    return (j.earningsCalendar ?? []).map((e) => ({
      symbol: e.symbol,
      date: e.date,
      hour: e.hour ?? null,
      epsEstimate: e.epsEstimate ?? null,
      revenueEstimate: e.revenueEstimate ?? null,
    }));
  });
  return { enabled: true as const, data: r };
}
