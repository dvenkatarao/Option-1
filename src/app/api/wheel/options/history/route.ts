import { ApiError, handle } from "@/lib/api";
import { getOptionChain } from "@/lib/options-providers";
import { parseOcc } from "@/lib/options-parse";
import { getOptionQuoteHistory, recordOptionQuoteSnapshots } from "@/lib/option-snapshots";
import { getStock } from "@/lib/stock-service";
import { yahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

async function captureSelectedContract(contractSymbol: string) {
  const occ = parseOcc(contractSymbol);
  if (!occ) return;
  const quotes = await yahooQuotes([occ.underlying]).catch(() => []);
  const quote = quotes.find((item) => item.symbol === occ.underlying) ?? null;
  const stored = await getStock(occ.underlying).catch(() => null);
  const spot = quote?.price ?? stored?.price ?? null;
  if (spot == null || !(spot > 0)) return;

  const chain = await getOptionChain({ symbol: occ.underlying, type: occ.type, price: spot, dteMin: 7, dteMax: 75, divYield: stored?.events?.dividendYield ?? 0 });
  const selected = chain.contracts.find((item) => item.symbol === contractSymbol);
  if (!selected || !chain.fetchedAt) return;
  await recordOptionQuoteSnapshots({
    ticker: occ.underlying,
    underlyingPrice: chain.underlyingPrice ?? spot,
    contracts: [selected],
    fetchedAt: chain.fetchedAt,
    stale: chain.stale,
    marketState: quote?.marketState,
    isDelayed: chain.isDelayed,
  });
}

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const contract = (url.searchParams.get("contract") ?? "").toUpperCase();
  if (!parseOcc(contract)) throw new ApiError(400, "A valid OCC option contract symbol is required");
  const rawDays = Number(url.searchParams.get("days") ?? 30);
  const days = Number.isFinite(rawDays) ? Math.min(90, Math.max(1, Math.round(rawDays))) : 30;

  // The full-chain capture covers common contracts. Capture the selected contract as well so a valid
  // but less-liquid strike can start its own history when opened in the detail workspace.
  await captureSelectedContract(contract).catch((error) => {
    console.warn("[options] selected contract snapshot skipped:", error instanceof Error ? error.message : error);
  });
  const history = await getOptionQuoteHistory(contract, days);
  return Response.json({ contract, days, history, historyStartsAt: history[0]?.bucket ?? null });
});
