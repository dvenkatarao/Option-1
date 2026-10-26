# Unified build plan: ETF Research Lab + Options Wheel

> **Port note:** This document is retained from the upstream `etf-src` project as implementation history. This repository integrates its data engine and features into the existing WheelCore single-page workstations; upstream paths such as `/wheel`, `/wheel/guide`, and `/etf/[ticker]` are not standalone routes here.

Single source of truth for the upstream build. Update the checkboxes and the Notes log at the end of every phase. If a session is cut off, resume at the first unchecked phase. (`docs/HANDOFF.md` has the older background; this file supersedes it for upstream status.)

Resume recipe: unzip, `npm ci`, local Postgres + `DATABASE_URL`, `node scripts/migrate.mjs`, then `npx tsc --noEmit && npx eslint . && npx vitest run`. The sandbox has no access to Yahoo/FRED/Alpaca and no Docker daemon; live data must be validated on the user's machine.

## Requirements traceability (everything the user asked for the Wheel)
| # | Requirement | Where | Status |
|---|---|---|---|
| R1 | Only A/A+ stocks on value, market cap, analyst rating | `stock-quality.ts`, `/wheel` grade filter | done |
| R2 | Assistant defines the best parameters | `DEFAULT_PARAMS` in `wheel.ts` (delta .15-.30, DTE 21-50, OI>=100, spread<=10%, return>=8%) | done |
| R3 | Best option chain choice by delta, return on risk, premium | `evaluatePut`, score, per-stock best + full list on `/wheel/[ticker]` | done |
| R4 | Earnings highlighted; excluded by default; checkbox to include | earnings watch box, badges, `earn=1` | done |
| R5 | Key levels: support/resistance, VWAP, VWMA, RSI, MACD, etc. | `technicals.ts`, `KeyLevels.tsx` | done |
| R6 | R / T account flag | `accountFit`, `AcctFlag` | done |
| R7 | Scan the universe, show all matches, no capital cap | `stock-universe.ts` (~330) + `WHEEL_EXTRA_SYMBOLS` | done |
| R8 | In-product step-by-step guide (assignment, ex-dividend, etc.) | `/wheel/guide` | done |
| R9 | Alpaca primary, Yahoo backup | `options-providers.ts`, `options-parse.ts` | code done, parsers reviewed against documented API shapes, **live-unverified** |
| R10 | Covered-call finder after assignment | `/wheel/[ticker]?basis=` | done |
| R11 | Margin of safety (breakeven vs analyst target) | `/wheel` Cushion cell + `/wheel/[ticker]` Breakeven cell | done |
| R12 | Docker/Render deployable with all new settings | `docker-compose.yml`, `render.yaml`, `.env.example`, env.ts blank-safe enums | done (Docker itself untestable in sandbox) |
| R13 | All earlier ETF features retained | P5 regression: /, /screener, /recommend, /coverage, /macro, /news, /compare, /portfolio, /sources, /etf/X all 200; quality card, screener column intact | done |
| R14 | Docs, sources catalog, dashboard link | README, DEPLOYMENT, `sources.ts` (Alpaca now used), dashboard button | done (`spec.ts` is a generated product spec, intentionally not changed) |
| - | Deferred by decision: wheel position tracking (belongs to portfolio work), IV rank (needs stored IV history), automated order placement (never) | | deferred |

## Phases
- [x] **P0** Foundation: stock grade, technicals, Black-Scholes, wheel scoring, parsers, providers, DB tables + migration 0002, services, API routes, pages, guide, nav. (done in earlier sessions)
- [x] **P1** Cosmetic fixes + verify filters and detail page with seeded data (remove duplicate `<Disclaimer />` in wheel pages, fix "as of as of").
- [x] **P2** Margin-of-safety column (breakeven vs analyst target); mark Alpaca `usedInApp` in `sources.ts`; add wheel endpoints to `spec.ts`; dashboard card linking to Wheel.
- [x] **P3** Deployment wiring: pass `ALPACA_*`, `OPTIONS_PROVIDER`, `WHEEL_*`, `RISK_FREE_RATE` through `docker-compose.yml` and `render.yaml`; `.env.example`; README + DEPLOYMENT docs.
- [x] **P4** Tests: `wheel-filters`, wheel-service pure helpers; keep all existing tests green.
- [x] **P5** Final verification and delivery: clean DB migrate 0000-0002, upgrade path from a 0001 DB, production build, run server, regression-check old ETF pages (/, /screener, /recommend, /coverage, /macro, /etf/X) plus all wheel routes; repackage (no node_modules/.next) and send.

## Notes log
- 2026-10-22: Found that Docker/Render configs omit Alpaca/Wheel env vars (would silently use Yahoo). Fix in P3.
- 2026-10-22: Last sandbox check showed screener logic correct on seeded data (A-grade gating, earnings hold-back, failed-scan reporting, R/T flags).
- Decisions: see `docs/HANDOFF.md` section 3 (grade bands, credit estimate, earnings rules, R/T rule, universe).
- Unverified against live services: Alpaca endpoints (`data.alpaca.markets/v1beta1/options/snapshots/{symbol}`, `/v2/options/contracts`), Yahoo `v7/finance/options`, Yahoo quoteSummary field names, bundled ticker validity.
- 2026-10-22: P1-P4 done. 131 tests pass; tsc + eslint clean. Next: P5 (final verification + delivery).
- 2026-10-22: P5 done. Fresh-DB and 0001->0002 upgrade migrations verified; production build + server run; all old and new routes return 200 (401 without login); filters, detail page (puts, calls, key levels) verified on seeded data.
- Bug fixed in P5: covered-call early-assignment flag fired "high" for every call although all candidates are out of the money. Now: high only if strike within 2% of price and time value < dividend; otherwise amber "watch before ex-div" when an ex-date is inside the term. Guide text updated. 132 tests pass.
- Also fixed: blank enum values in .env (e.g. `ALPACA_PAPER=`) no longer crash env validation.

## STATUS: BUILD COMPLETE (all phases done). Remaining work = user-side validation + optional backlog
1. On the user's machine: `docker compose build --no-cache web && docker compose up -d` (never `down -v`), add `ALPACA_API_KEY`/`ALPACA_SECRET_KEY` to `.env`, open `/wheel`, let the progress bar finish, report anything that looks off. First live run is the only test of Alpaca/Yahoo option endpoints and Yahoo fundamentals field names.
2. Possible follow-ups (user decides): IV rank from stored daily IV history (needs a snapshot job like quote_snapshots); wheel position tracking (merge with deferred portfolio work); email alerts; more universe coverage; the ETF backlog (#11 equivalent-fund grouping, #12 guided advisor, ...).
