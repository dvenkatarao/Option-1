import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { handle, parseBody, requirePortfolio } from "@/lib/api";
import { getPortfolioAnalytics } from "@/lib/portfolio-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (id !== "all") await requirePortfolio(id);
  return Response.json(await getPortfolioAnalytics(id));
});

const patchSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  await requirePortfolio(id);
  const { name } = await parseBody(req, patchSchema);
  await db.update(portfolios).set({ name, updatedAt: new Date() }).where(eq(portfolios.id, id));
  return Response.json({ success: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await requirePortfolio(id);
  await db.delete(portfolios).where(eq(portfolios.id, id));
  return Response.json({ success: true });
});
