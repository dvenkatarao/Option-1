/** Only Yahoo's cookie/crumb flow needs a browser-like UA. */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Descriptive User-Agent with contact info. REQUIRED by SEC EDGAR and, as verified,
 * also needed for FRED: fred.stlouisfed.org silently drops connections that present a
 * Chrome-style UA (curl exit 000 / Node fetch hangs until timeout) but answers this UA in ~70 ms.
 * Override via SEC_USER_AGENT.
 */
export const SEC_UA =
  process.env.SEC_USER_AGENT || "WheelCore/1.0 (research-app@example.com)";

export const DEFAULT_UA = SEC_UA;

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchText(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; retries?: number; method?: string; body?: string } = {},
): Promise<string> {
  const { headers = {}, timeoutMs = 15000, retries = 1, method = "GET", body } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { "User-Agent": DEFAULT_UA, Accept: "*/*", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        // 429 / 5xx are worth one retry; 4xx otherwise are final
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw new HttpError(`HTTP ${res.status} for ${new URL(url).host}${new URL(url).pathname}`, res.status);
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T = unknown>(url: string, opts: Parameters<typeof fetchText>[1] = {}): Promise<T> {
  const text = await fetchText(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers ?? {}) } });
  return JSON.parse(text) as T;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
