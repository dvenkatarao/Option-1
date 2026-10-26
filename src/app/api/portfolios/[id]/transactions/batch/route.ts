import { z } from "zod";
import { handle, parseBody, requirePortfolio } from "@/lib/api";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { generateId } from "@/lib/security";
import { isValidTicker } from "@/lib/universe";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  type: z.string().transform((s) => s.trim().toUpperCase()).pipe(z.enum(["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL"])),
  ticker: z.string().trim().optional().nullable().transform((v) => (v ? v.toUpperCase() : null)).refine((v) => v == null || isValidTicker(v), "invalid ticker"),
  quantity: z.coerce.number().optional().nullable(),
  price: z.coerce.number().optional().nullable(),
  amount: z.coerce.number(),
  fee: z.coerce.number().optional().nullable().default(0),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional().nullable(),
});

const schema = z.object({
  rows: z.array(rowSchema).min(1).max(5000),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id: portfolioId } = await params;
  await requirePortfolio(portfolioId);
  const body = await parseBody(req, schema);

  const toInsert = body.rows.map((r) => ({
    id: generateId("tx"),
    portfolioId,
    ticker: r.ticker ?? null,
    type: r.type,
    quantity: r.quantity ?? null,
    price: r.price ?? null,
    amount: r.amount,
    fee: r.fee ?? 0,
    transactionDate: r.transactionDate,
    notes: r.notes ?? null,
  }));

  await db.insert(transactions).values(toInsert);
  return Response.json({ success: true, imported: toInsert.length });
});
