import { z } from "zod";
import { handle, parseBody } from "@/lib/api";
import { runScanBatch, staleScanTickers } from "@/lib/wheel-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET: how many A/A+ stocks need a fresh option-chain scan. */
export const GET = handle(async () => Response.json({ remaining: (await staleScanTickers()).length }));

const schema = z.object({ limit: z.coerce.number().int().min(1).max(20).default(8) });

/** POST {limit?}: scan a batch of stale stocks' put chains (Alpaca first, Yahoo as backup). */
export const POST = handle(async (req: Request) => Response.json(await runScanBatch((await parseBody(req, schema)).limit, 3)));
