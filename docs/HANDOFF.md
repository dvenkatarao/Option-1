> **Upstream reference only:** This handoff describes the original `etf-src` Next.js route-based UI and its implementation history. In this WheelCore repository, the services, database, APIs and selected screens are integrated into the existing WheelCore workstations; the upstream page routes below are not exposed as standalone pages.
>
> Status moved to `docs/BUILD_PLAN.md` (single source of truth for the upstream project). The source Wheel build is complete; this file keeps background and decisions.

# ETF Research Lab: Upstream Handoff (Wheel feature)

Last updated: 2026-10-22. Project root = the folder this file is in (`etf-src`). The zip that contains this file holds the **exact current code**; nothing below replaces it.

## How to resume in a new session
1. Unzip, attach the zip (or just this file plus the zip) to a new chat.
2. Say: "Continue from docs/HANDOFF.md, do Session W1."
3. Setup commands: `npm ci`; local Postgres (`DATABASE_URL`), `node scripts/migrate.mjs`; checks: `npx tsc --noEmit && npx eslint . && npx vitest run`.
4. The sandbox cannot reach Yahoo/FRED/Alpaca or run Docker. Live data must be validated on the user's machine.

## 1. Completed
**Earlier phases (all done, shipped in earlier zips):** production hardening (auth, env validation, CSRF, migrations 0000/0001, Docker, CI); Recommend scoring fixes (within-class ranking, editable weights); Coverage audit page; **ETF fund quality grade A-F** (ETF page card, Screener column/filter, Recommend hides D/F, 30-min market-hours quote snapshots table for spread history); strict FRED CSV parser (maintenance page returned junk before; FRED was in maintenance on 2026-10-21).

**Wheel feature (this phase), built and typechecking (tsc + eslint clean, 117+ tests passing before the last additions):**
- Pure libs + tests: `stock-quality.ts` (stock grade A+..F), `technicals.ts` (SMA/EMA, RSI, MACD, Bollinger, ATR, VWMA, anchored VWAP, support/resistance), `bs.ts` (Black-Scholes delta), `wheel.ts` (put/call evaluation, scoring, R/T `accountFit`, earnings status), `options-parse.ts` (Alpaca + Yahoo parsing, `runProviders` failover), `stock-parse.ts` (+ `tests/stock-parse.test.ts`).
- Data layer: `options-providers.ts` (Alpaca primary when `ALPACA_API_KEY`/`ALPACA_SECRET_KEY` set, Yahoo backup, 120 s cache), `yahoo.ts` (`yahooBars` OHLCV added), `stock-universe.ts` (~330 bundled large caps + `WHEEL_EXTRA_SYMBOLS`), `stock-service.ts` (hydrate, grade), `wheel-service.ts` (scan batches, `getWheelResults`, earnings watch, background scanner `startWheelScanner`), `instrumentation.ts` starts it, DB tables `stocks` + `wheel_scans` (migration `drizzle/0002_wheel_stocks.sql`, applied, no drift), API `/api/wheel/refresh` and `/api/wheel/scan` (GET remaining, POST batch).
- UI: `/wheel` (filters form, status bar, earnings watch, results table, held-back-by-earnings note, failed-scan list), `/wheel/[ticker]` (stats, grade card, key levels card, live put table, covered-call finder with cost-basis input), `/wheel/guide` (full step-by-step user guide incl. assignment, ex-dividend, earnings, R vs T, levels, scoring, management, limits, troubleshooting, glossary), components `WheelHydrator`, `WheelBits`, `StockGradeCard`, `KeyLevels`, `lib/wheel-filters.ts`; "Wheel" link in `Nav.tsx`.
- Verified end to end with synthetic seeded data (production build + server): A/A+ gating (B-grade stock absent), earnings hold-back (stock with earnings in 10 d hidden by default, shown with red badge when `earn=1`), failed scan listed, R/T flags, Yahoo-backup badge, hand-checked return/cushion math.

## 2. Current file state
Everything is in the zip. Key signatures:
- `getWheelResults(filters, today)` -> `{rows, heldBackByEarnings, earningsWatch, rejected, info}`
- `scanPuts(chain, ctx, params, today)` / `scanCalls(chain, ctx, basis, params, today)` in `wheel.ts`; `DEFAULT_PARAMS` = delta 0.15-0.30, DTE 21-50, OI>=100, spread<=10%, min annual return 8%, earnings excluded.
- Chain cache key: `opt:chain:v1:${OPTIONS_PROVIDER}:${symbol}:${type}:${dteMin}-${dteMax}` (payload `{contracts, source, fallbackReason, rate}`) in `cache_entries`; use it to seed the detail page in the sandbox.
- Env (in `env.ts`): `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER`(true), `ALPACA_OPTIONS_FEED`(indicative|opra), `OPTIONS_PROVIDER`(auto|alpaca|yahoo), `WHEEL_SCANNER`, `WHEEL_EXTRA_SYMBOLS`, `RISK_FREE_RATE`.
- Test seed scripts used (in scratchpad, not in zip): synthetic stocks AAAA..FFFF into `stocks` + `wheel_scans`.

## 3. Decisions and bugs resolved
- Stock grade bands: A+>=90, A>=80, B>=65, C>=50, D>=35; weights quality 30, strength 20, valuation 20, analysts 15, size 15; analysts only count with >=8 covering; caps for losses, negative FCF, cap<$10B, sell consensus, 40% drawdown.
- Credit estimate = bid + 25% of spread; score = min(annual return,1) x (1-|delta|) x liquidity x structure factor.
- Earnings: expiry on/after next earnings date is excluded by default (checkbox includes, red badge, score penalty); unknown date shown as risk; Yahoo date windows treated as estimated (earliest date).
- R/T flag: beta>1.3 -> T; annual return >=15% -> R; <10% -> T; else R/T (general guidance, not tax advice).
- Failed scan clears stored contracts and sets `scanned_at` (so loops terminate and stale quotes never show as current).
- Universe is a bundled approximation of the S&P 500, not an official feed (user chose "scan the universe", no capital cap).
- Fixed: FRED parser junk; `pkill -f` self-kill; missing `drizzle-orm` import from scratchpad; duplicate task entries.
- Known cosmetic issues (not yet fixed): `/wheel` page shows "as of as of <date>" (remove my "as of " prefix in `SourceNote asOf`); the layout already renders `<Disclaimer />` on every page, so remove the extra `<Disclaimer />` in `wheel/page.tsx`, `wheel/[ticker]/page.tsx`, `wheel/guide/page.tsx` (replace with the short options-risk note).

## 4. Work plan (small sessions, each fits one free session)
**W1 (next, ~20 min): finish verification.** Apply the two cosmetic fixes above. Restart the server (`WHEEL_SCANNER=false QUOTE_SNAPSHOTS=false`, build first) with the seeded data and check filters on `/wheel`: `acct=R`, `acct=T`, `grade=A%2B`, `trend=1`, `dMin/dMax`, `ret`, `dteMin/dteMax`, `oi`. Seed the chain cache key above and check `/wheel/AAAA` (put table, flags) and `?basis=100` (call table, early-assignment flag). Fix anything found.
**W2 (~15 min): tests + docs + ship.** Add `tests/wheel-filters.test.ts`; document the new env vars and the Wheel feature in `README.md`, `DEPLOYMENT.md`, `.env.example`; run tsc/eslint/vitest; repackage the zip (exclude `node_modules` and `.next`); send.
**W3 (on the user's machine, with the user):** rebuild (`docker compose build --no-cache web`, never `down -v`), add Alpaca keys, open `/wheel`, wait for the progress bar, report anything off. Unverified against live services: Alpaca endpoints (`data.alpaca.markets/v1beta1/options/snapshots/{symbol}`, `/v2/options/contracts`), Yahoo `v7/finance/options`, Yahoo quoteSummary field names, ticker list validity.
**W4+ (backlog, user decides order):** equivalent-fund grouping/overlap (#11), guided advisor (#12), trend/timing layer for ETFs (#15, #17), analyst consensus in ETF score (#18), plain-English layer (#19), then the rest of the backlog in the task list (portfolio tracking and live broker linking remain deferred).

## Better way to organize
- Keep this file and the latest zip as the single source of truth; each session ends with "update HANDOFF.md, rezip, send".
- Ask for one session = one item (W1, then W2...). Avoid asking for large builds in one go.
- Memory notes about the project's scope already exist in the assistant's memory, so a new chat remembers the goals but not the code. Always attach the zip.
