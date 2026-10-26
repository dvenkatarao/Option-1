#!/usr/bin/env npx tsx
/**
 * Quarterly universe refresh — docs/wheel-methodology.md §1
 * Run manually each quarter (Mar/Jun/Sep/Dec) or via CI cron:
 *   npx tsx scripts/universe-refresh.ts --check
 * Fetches current SPY holdings (Yahoo holdings module) and diffs vs BASE_STOCK_UNIVERSE.
 * Opens a PR-friendly diff — reviewer must approve, not auto-merge.
 * Stub until holdings provider is wired; currently reports current version and ticker count.
 */

import { BASE_STOCK_UNIVERSE, UNIVERSE_VERSION, UNIVERSE_AS_OF } from "../src/lib/stock-universe";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");

async function main() {
  console.log(`Universe version: ${UNIVERSE_VERSION} as of ${UNIVERSE_AS_OF}`);
  console.log(`Bundled tickers: ${BASE_STOCK_UNIVERSE.length}`);
  console.log(`Extra symbols: ${process.env.WHEEL_EXTRA_SYMBOLS ?? "(none)"}`);

  if (checkOnly) {
    console.log("\n--check: would fetch SPY/IVV holdings via yahooQuoteSummary(holdings) and diff here.");
    console.log("TODO: wire yahoo holdings fetch, compare, and emit PR markdown:");
    console.log("  Added:   TICKER (reason: promoted to S&P 500 Q1)");
    console.log("  Removed: TICKER (reason: delisted/acquired, fails hydrate >2 quarters)");
    console.log("  Version bump: 2026-Q1 -> 2026-Q2");
    return;
  }

  // Future: fetch, diff, write updated LIST + version constants + docs/wheel-methodology changelog
  console.log("\nFull refresh not yet wired — run with --check for preview.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
