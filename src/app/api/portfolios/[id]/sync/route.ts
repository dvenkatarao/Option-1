import { eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { handle, requirePortfolio } from "@/lib/api";
import { getPortfolioAnalytics } from "@/lib/portfolio-service";

export const dynamic = "force-dynamic";

/**
 * "Sync" re-prices holdings (quotes are always fetched live when analytics load). There is no live
 * broker feed, so positions themselves only change through CSV import or manual entry.
 */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const port = await requirePortfolio(id);
  await db.update(portfolios).set({ lastSyncedAt: new Date(), syncStatus: "synced", updatedAt: new Date() }).where(eq(portfolios.id, id));
  return Response.json({
    success: true,
    message: port.isDemo
      ? "Demo account re-priced with latest market data."
      : "Prices refreshed. Positions are not auto-synced from the broker; re-import a CSV statement to update them.",
    analytics: await getPortfolioAnalytics(id),
  });
});
