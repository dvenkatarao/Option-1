import { z } from "zod";
import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { handle, parseBody } from "@/lib/api";
import { LIVE_AGGREGATORS_MESSAGE, connectBrokerAccount } from "@/lib/brokers/aggregator";
import { SUPPORTED_BROKERS, type BrokerType } from "@/lib/brokers/types";
import { addPositionsToPortfolio } from "@/lib/portfolio-service";
import { generateId, maskAccountNumber } from "@/lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  brokerType: z.string().refine((s) => s in SUPPORTED_BROKERS, "unknown brokerType"),
  customName: z.string().trim().max(80).optional(),
  accountNumber: z.string().max(64).optional(),
  connectionMethod: z.enum(["sandbox", "snaptrade", "plaid"]).default("sandbox"),
});

/** Creates a DEMO account. Live aggregator connections are not implemented and say so. */
export const POST = handle(async (req: Request) => {
  const body = await parseBody(req, schema);
  if (body.connectionMethod !== "sandbox") {
    return Response.json({ error: LIVE_AGGREGATORS_MESSAGE }, { status: 501 });
  }
  const brokerType = body.brokerType as BrokerType;
  const meta = SUPPORTED_BROKERS[brokerType];
  const name = body.customName || `${meta.name} (Demo)`;
  const masked = maskAccountNumber(body.accountNumber);

  const res = await connectBrokerAccount({ brokerType, portfolioName: name, accountNumberMasked: masked, connectionMethod: "sandbox" });
  const portId = generateId("port");
  await db.insert(portfolios).values({
    id: portId,
    name,
    brokerType,
    accountNumberMasked: masked,
    syncStatus: "synced",
    lastSyncedAt: new Date(),
    encryptedCredentials: res.encryptedTokenPayload,
    isDemo: true,
  });
  const importedPositions = await addPositionsToPortfolio(portId, res.positions);
  return Response.json({ success: true, portfolioId: portId, name, brokerType, importedPositions, message: res.syncMessage, demo: true }, { status: 201 });
});
