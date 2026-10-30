import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { getSchwabConnectionStatus } from "@/lib/schwab-auth";
import { testSchwabOptionChain } from "@/lib/options-providers";
import { isValidTicker } from "@/lib/universe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const schema = z.string().min(1).max(10);

export const GET = handle(async (request: Request) => {
  const url = new URL(request.url);
  const parsed = schema.safeParse(url.searchParams.get("symbol") ?? "SPY");
  if (!parsed.success) throw new ApiError(400, "Provide a valid ticker for the Schwab chain check.");
  const symbol = parsed.data.toUpperCase();
  if (!isValidTicker(symbol)) throw new ApiError(400, "Invalid ticker");

  const status = await getSchwabConnectionStatus();
  if (!status.configured) throw new ApiError(503, status.setupMessage ?? "Schwab is not configured.");
  if (!status.connected) throw new ApiError(409, status.setupMessage ?? "Connect Schwab before testing a chain.");

  const result = await testSchwabOptionChain(symbol);
  return Response.json({
    symbol,
    source: result.source,
    underlyingPrice: result.underlyingPrice,
    isDelayed: result.isDelayed,
    contractCount: result.contracts.length,
    fetchedAt: result.fetchedAt,
    contracts: result.contracts.slice(0, 6).map((contract) => ({
      symbol: contract.symbol,
      expiration: contract.expiration,
      strike: contract.strike,
      bid: contract.bid,
      ask: contract.ask,
      last: contract.last,
      iv: contract.iv,
      delta: contract.delta,
      quoteTimestamp: contract.quoteTimestamp,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
});
