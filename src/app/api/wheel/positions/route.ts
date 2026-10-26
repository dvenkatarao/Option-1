import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { wheelPositions } from "@/db/schema";
import { ApiError, handle, isoDate, num, parseBody } from "@/lib/api";
import { generateId } from "@/lib/security";
import { isValidTicker } from "@/lib/universe";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const positions = await db.select().from(wheelPositions).orderBy(desc(wheelPositions.createdAt)).limit(200);
  return Response.json({ positions });
});

const createSchema = z.object({
  ticker: z.string().trim().toUpperCase().refine(isValidTicker, "Invalid ticker symbol"),
  side: z.enum(["put_sold", "assigned", "call_sold", "closed"]),
  strike: num.refine((value) => value > 0, "Strike must be greater than zero"),
  expiration: isoDate,
  premium: num.refine((value) => value >= 0, "Premium must be non-negative"),
  quantity: num.refine((value) => value > 0 && value <= 10000, "Quantity must be between 1 and 10,000").default(1),
  openedAt: isoDate.optional(),
  closedAt: isoDate.nullable().optional(),
  costBasis: num.refine((value) => value >= 0, "Cost basis must be non-negative").nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const POST = handle(async (req: Request) => {
  const body = await parseBody(req, createSchema);
  const id = generateId("wheel");
  const [position] = await db
    .insert(wheelPositions)
    .values({
      id,
      ticker: body.ticker,
      side: body.side,
      strike: body.strike,
      expiration: body.expiration,
      premium: body.premium,
      quantity: body.quantity,
      openedAt: body.openedAt ?? new Date().toISOString().slice(0, 10),
      closedAt: body.closedAt ?? null,
      costBasis: body.costBasis ?? null,
      notes: body.notes ?? null,
    })
    .returning();
  return Response.json({ success: true, position }, { status: 201 });
});

const patchSchema = z.object({
  id: z.string().min(1),
  side: z.enum(["put_sold", "assigned", "call_sold", "closed"]).optional(),
  closedAt: isoDate.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const PATCH = handle(async (req: Request) => {
  const body = await parseBody(req, patchSchema);
  const { id, ...changes } = body;
  if (Object.keys(changes).length === 0) throw new ApiError(400, "At least one field must be updated");
  const [position] = await db.update(wheelPositions).set(changes).where(eq(wheelPositions.id, id)).returning();
  if (!position) throw new ApiError(404, "Wheel position not found");
  return Response.json({ success: true, position });
});

export const DELETE = handle(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "id query parameter is required");
  await db.delete(wheelPositions).where(eq(wheelPositions.id, id));
  return Response.json({ success: true });
});
