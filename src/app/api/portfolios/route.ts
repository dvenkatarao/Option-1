import { z } from "zod";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { handle, parseBody } from "@/lib/api";
import { SUPPORTED_BROKERS, type BrokerType } from "@/lib/brokers/types";
import { getPortfolioAnalytics } from "@/lib/portfolio-service";
import { generateId, maskAccountNumber } from "@/lib/security";

export const dynamic = "force-dynamic";

export const GET = handle(async () => Response.json(await getPortfolioAnalytics()));

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  brokerType: z.string().transform((s) => s.toLowerCase()).refine((s) => s in SUPPORTED_BROKERS, "unknown brokerType"),
  accountNumber: z.string().max(64).optional(),
});

export const POST = handle(async (req: Request) => {
  const body = await parseBody(req, createSchema);
  const row = {
    id: generateId("port"),
    name: body.name,
    brokerType: body.brokerType as BrokerType,
    accountNumberMasked: maskAccountNumber(body.accountNumber),
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  };
  await db.insert(portfolios).values(row);
  return Response.json({ success: true, portfolio: row }, { status: 201 });
});
