import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { getOptionChain } from "@/lib/options-providers";
import { isValidTicker } from "@/lib/universe";
import { yahooQuotes } from "@/lib/yahoo";
import { getStock } from "@/lib/stock-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  symbol: z.string().min(1).max(10),
  type: z.enum(["put", "call", "both"]).default("both"),
  dteMin: z.coerce.number().int().min(1).max(365).default(7),
  dteMax: z.coerce.number().int().min(1).max(365).default(75),
});

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    symbol: url.searchParams.get("symbol") ?? "",
    type: url.searchParams.get("type") ?? "both",
    dteMin: url.searchParams.get("dteMin") ?? 7,
    dteMax: url.searchParams.get("dteMax") ?? 75,
  });
  if (!parsed.success) throw new ApiError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const symbol = parsed.data.symbol.toUpperCase();
  if (!isValidTicker(symbol)) throw new ApiError(400, "Invalid ticker");
  let dteMin = parsed.data.dteMin;
  let dteMax = parsed.data.dteMax;
  if (dteMin > dteMax) [dteMin, dteMax] = [dteMax, dteMin];

  const quotes = await yahooQuotes([symbol]).catch(() => []);
  const price = quotes[0]?.price ?? null;
  if (price == null || !(price > 0)) throw new ApiError(404, `No quote for ${symbol}`);

  const want = parsed.data.type;
  const types = want === "both" ? (["put", "call"] as const) : ([want] as const);
  const fetched = await Promise.all(
    types.map((type) => getOptionChain({ symbol, type, price, dteMin, dteMax })),
  );

  const contracts = fetched.flatMap((r) =>
    r.contracts
      .filter((c) => c.bid != null && c.ask != null && c.bid > 0)
      .slice(0, 120)
      .map((c) => ({
        type: c.type,
        strike: c.strike,
        expiration: c.expiration,
        bid: c.bid,
        ask: c.ask,
        iv: c.iv,
        delta: c.delta,
        oi: c.oi,
      })),
  );

  let nextEarnings: string | null = null;
  try {
    const row = await getStock(symbol);
    const ev = row?.events as { nextEarnings?: string | null } | null | undefined;
    nextEarnings = ev?.nextEarnings ?? null;
  } catch {
    /* stock row is optional — pills stay unknown */
  }

  return Response.json({
    symbol,
    price,
    nextEarnings,
    source: fetched.map((r) => r.source).join("+"),
    fetchedAt: fetched.map((r) => r.fetchedAt).sort().slice(-1)[0] ?? null,
    stale: fetched.some((r) => r.stale),
    contracts,
  });
});
