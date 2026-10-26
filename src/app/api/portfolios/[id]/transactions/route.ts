import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { positions, transactions } from "@/db/schema";
import { ApiError, handle, isoDate, num, parseBody, requirePortfolio } from "@/lib/api";
import { generateId } from "@/lib/security";
import { isValidTicker } from "@/lib/universe";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await requirePortfolio(id);
  const txList = await db
    .select()
    .from(transactions)
    .where(eq(transactions.portfolioId, id))
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .limit(1000);
  return Response.json({ transactions: txList });
});

const blankToUndef = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());

const schema = z
  .object({
    type: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL"])),
    ticker: blankToUndef(z.string().trim().toUpperCase().refine(isValidTicker, "Invalid ticker symbol")),
    quantity: blankToUndef(num.refine((n) => n > 0, "quantity must be > 0")),
    price: blankToUndef(num.refine((n) => n >= 0, "price must be >= 0")),
    amount: num,
    fee: blankToUndef(num.refine((n) => n >= 0, "fee must be >= 0")),
    transactionDate: blankToUndef(isoDate),
    notes: blankToUndef(z.string().max(500)),
  })
  .refine((b) => !["BUY", "SELL"].includes(b.type) || (b.ticker && b.quantity), { message: "BUY/SELL require ticker and quantity" });

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id: portfolioId } = await params;
  await requirePortfolio(portfolioId);
  const b = await parseBody(req, schema);
  const date = b.transactionDate ?? new Date().toISOString().slice(0, 10);
  const txId = generateId("tx");

  await db.transaction(async (tx) => {
    // BUY/SELL adjust the position; reject a SELL larger than the holding before anything is written.
    if ((b.type === "BUY" || b.type === "SELL") && b.ticker && b.quantity) {
      const [existing] = await tx
        .select()
        .from(positions)
        .where(and(eq(positions.portfolioId, portfolioId), eq(positions.ticker, b.ticker)))
        .for("update");

      if (b.type === "SELL") {
        if (!existing) throw new ApiError(400, `No ${b.ticker} position to sell`);
        if (b.quantity > existing.quantity + 1e-9) throw new ApiError(400, `Cannot sell ${b.quantity} ${b.ticker}; only ${existing.quantity} held`);
        const remaining = existing.quantity - b.quantity;
        if (remaining <= 1e-9) await tx.delete(positions).where(eq(positions.id, existing.id));
        else await tx.update(positions).set({ quantity: remaining, updatedAt: new Date() }).where(eq(positions.id, existing.id));
      } else if (existing) {
        const qty = existing.quantity + b.quantity;
        const unit = b.price ?? Math.abs(b.amount) / b.quantity;
        const blended = (existing.quantity * existing.averageCostBasis + b.quantity * unit) / qty;
        await tx.update(positions).set({ quantity: qty, averageCostBasis: blended, updatedAt: new Date() }).where(eq(positions.id, existing.id));
      } else {
        await tx.insert(positions).values({
          id: generateId("pos"),
          portfolioId,
          ticker: b.ticker,
          quantity: b.quantity,
          averageCostBasis: b.price ?? Math.abs(b.amount) / b.quantity,
          purchaseDate: date,
          assetType: "ETF",
        });
      }
    }
    await tx.insert(transactions).values({
      id: txId,
      portfolioId,
      ticker: b.ticker ?? null,
      type: b.type,
      quantity: b.quantity ?? null,
      price: b.price ?? null,
      amount: b.amount,
      fee: b.fee ?? 0,
      transactionDate: date,
      notes: b.notes ?? null,
    });
  });
  return Response.json({ success: true, transactionId: txId }, { status: 201 });
});
