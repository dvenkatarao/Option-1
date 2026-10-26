import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { positions } from "@/db/schema";
import { ApiError, handle, isoDate, num, parseBody, requirePortfolio } from "@/lib/api";
import { generateId } from "@/lib/security";
import { isValidTicker } from "@/lib/universe";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  ticker: z.string().trim().toUpperCase().refine(isValidTicker, "Invalid ticker symbol"),
  quantity: num.refine((n) => n > 0, "Quantity must be greater than 0"),
  averageCostBasis: num.refine((n) => n >= 0, "Cost basis must be non-negative"),
  purchaseDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  assetType: z.enum(["ETF", "EQUITY", "BOND", "CASH", "FUTURES"]).optional(),
});

/** Upserts one position (sets quantity/cost to the submitted values). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id: portfolioId } = await params;
  await requirePortfolio(portfolioId);
  const b = await parseBody(req, schema);
  const today = new Date().toISOString().slice(0, 10);

  const [row] = await db
    .insert(positions)
    .values({
      id: generateId("pos"),
      portfolioId,
      ticker: b.ticker,
      quantity: b.quantity,
      averageCostBasis: b.averageCostBasis,
      purchaseDate: b.purchaseDate ?? today,
      assetType: b.assetType ?? "ETF",
    })
    .onConflictDoUpdate({
      target: [positions.portfolioId, positions.ticker],
      set: {
        quantity: b.quantity,
        averageCostBasis: b.averageCostBasis,
        ...(b.purchaseDate ? { purchaseDate: b.purchaseDate } : {}),
        ...(b.assetType ? { assetType: b.assetType } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: positions.id });
  return Response.json({ success: true, positionId: row.id });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { id: portfolioId } = await params;
  await requirePortfolio(portfolioId);
  const positionId = new URL(req.url).searchParams.get("positionId");
  if (!positionId) throw new ApiError(400, "positionId query parameter is required");
  await db.delete(positions).where(and(eq(positions.id, positionId), eq(positions.portfolioId, portfolioId)));
  return Response.json({ success: true });
});
