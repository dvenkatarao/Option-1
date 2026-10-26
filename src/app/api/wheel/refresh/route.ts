import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { refreshStock, refreshStockBatch, staleStocks } from "@/lib/stock-service";
import { isValidTicker } from "@/lib/universe";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET: how many universe stocks still need fundamentals/technicals. */
export const GET = handle(async () => Response.json({ remaining: (await staleStocks()).length }));

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(16).default(8),
  ticker: z.string().trim().toUpperCase().refine(isValidTicker, "Invalid ticker").optional(),
});

/** POST {limit?, ticker?}: refresh a batch of stale stocks (or one specific ticker). */
export const POST = handle(async (req: Request) => {
  const body = await parseBody(req, schema);
  if (body.ticker) {
    try {
      await refreshStock(body.ticker);
      return Response.json({ ok: true, ticker: body.ticker });
    } catch (e) {
      return Response.json({ ok: false, ticker: body.ticker, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  return Response.json(await refreshStockBatch(body.limit, 4));
});
