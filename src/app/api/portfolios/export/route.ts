import { handle } from "@/lib/api";
import { getPortfolioAnalytics } from "@/lib/portfolio-service";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "all";
  const analytics = await getPortfolioAnalytics(id === "all" ? undefined : id);

  const header = ["portfolio", "broker", "ticker", "name", "quantity", "avgCost", "currentPrice", "marketValue", "unrealizedGain", "weightPct", "expenseRatio", "ttmYield", "erosionLevel", "priceSource"];
  const rows = analytics.positions.map((p) => [
    p.portfolioName ?? "",
    p.brokerType ?? "",
    p.ticker,
    (p.name ?? "").replace(/[,\"\n]/g, " "),
    String(p.quantity),
    String(p.averageCostBasis),
    String(p.currentPrice ?? ""),
    String(p.marketValue ?? ""),
    String(p.unrealizedGain ?? ""),
    String((p.weight * 100).toFixed(2)),
    String(p.expenseRatio ?? ""),
    String(p.ttmYield ?? ""),
    p.erosionLevel ?? "",
    p.priceSource,
  ]);

  const csv = [header, ...rows].map((cols) => cols.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="portfolio-${id}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
