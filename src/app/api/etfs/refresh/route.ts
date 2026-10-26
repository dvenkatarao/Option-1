import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { refreshBatch, refreshEtf, staleTickers } from "@/lib/etf-service";
import { isValidTicker } from "@/lib/universe";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET: how many tickers still need hydration. */
export const GET = handle(async () => Response.json({ remaining: (await staleTickers()).length }));

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(16).default(8),
  ticker: z.string().trim().toUpperCase().refine(isValidTicker, "Invalid ticker").optional(),
});

/** POST {limit?, ticker?}: refresh a batch of stale tickers (or one specific ticker). */
export const POST = handle(async (req: Request) => {
  const body = await parseBody(req, schema);
  if (body.ticker) {
    try {
      await refreshEtf(body.ticker);
      return Response.json({ ok: true, ticker: body.ticker });
    } catch (e) {
      return Response.json({ ok: false, ticker: body.ticker, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  return Response.json(await refreshBatch(body.limit, 4));
});
