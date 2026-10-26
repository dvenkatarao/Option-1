import { z } from "zod";
import { handle, parseBody, requirePortfolio } from "@/lib/api";
import { parseBrokerPositionsCsv } from "@/lib/brokers/csv-parser";
import { SUPPORTED_BROKERS, type BrokerType } from "@/lib/brokers/types";
import { addPositionsToPortfolio, getPortfolioAnalytics } from "@/lib/portfolio-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  csvContent: z.string().min(1, "csvContent is required").max(1_000_000),
  preferredBroker: z.string().refine((s) => s in SUPPORTED_BROKERS, "unknown broker").optional(),
  mode: z.enum(["replace", "add"]).default("replace"),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requirePortfolio(id);
  const body = await parseBody(req, schema);

  const parsed = parseBrokerPositionsCsv(body.csvContent, body.preferredBroker as BrokerType | undefined);
  if (!parsed.success || parsed.positions.length === 0) {
    return Response.json(
      {
        success: false,
        error: parsed.errors.slice(0, 5).join("; ") || "No valid positions found in CSV",
        errors: parsed.errors.slice(0, 50),
        ignoredRowsCount: parsed.ignoredRowsCount,
      },
      { status: 400 },
    );
  }

  const importedCount = await addPositionsToPortfolio(id, parsed.positions, body.mode);
  return Response.json({
    success: true,
    importedCount,
    brokerDetected: parsed.brokerDetected,
    ignoredRowsCount: parsed.ignoredRowsCount,
    warnings: parsed.warnings,
    errors: parsed.errors.slice(0, 50),
    analytics: await getPortfolioAnalytics(id),
  });
});
