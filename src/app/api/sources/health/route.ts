import { DEFAULT_UA as BROWSER_UA, mapLimit } from "@/lib/http";
import { cached } from "@/lib/cache";
import { SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Result = { id: string; status: "ok" | "reachable" | "down"; httpStatus: number | null; ms: number | null; note: string };

async function ping(id: string, url: string, headers: Record<string, string> = {}, timeoutMs = 12000): Promise<Result> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const ms = Date.now() - t0;
    // Do not download the body - we only need to know the endpoint answers.
    await res.body?.cancel().catch(() => undefined);
    if (res.ok) return { id, status: "ok", httpStatus: res.status, ms, note: "Responding" };
    if (res.status === 429) return { id, status: "reachable", httpStatus: 429, ms, note: "Reachable but rate-limited (HTTP 429)" };
    if (res.status === 401 || res.status === 403) return { id, status: "reachable", httpStatus: res.status, ms, note: "Reachable, authentication required" };
    return { id, status: "down", httpStatus: res.status, ms, note: `HTTP ${res.status}` };
  } catch (e) {
    return { id, status: "down", httpStatus: null, ms: null, note: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function GET() {
  const targets = SOURCES.filter((s) => s.health);
  // Fans out to dozens of third-party hosts: cache for 60s so repeated clicks cannot hammer them.
  const { data: results, fetchedAt } = await cached("sources:health:v1", 60, () =>
    mapLimit(targets, 6, (s) => ping(s.id, s.health!.url, s.health!.headers, s.health!.timeoutMs)),
  );
  const configured: Record<string, boolean> = {};
  for (const s of SOURCES) {
    if (s.envVar) {
      const names = s.envVar.match(/[A-Z][A-Z0-9_]{3,}/g) ?? [];
      configured[s.id] = names.length > 0 && names.every((n) => !!process.env[n]) && !s.envVar.includes("optional");
    }
  }
  return Response.json({ checkedAt: fetchedAt, results, configured });
}
