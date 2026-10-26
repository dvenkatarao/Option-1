# Wheel Methodology — Internal Business Logic

> Internal document. Not linked from `/wheel/guide` nav. Detailed enough for independent verification on finviz.com / schwab.com, but not exposed to novice users.

## 1. Universe

- **Source file:** `src/lib/stock-universe.ts` — `BASE_STOCK_UNIVERSE` is a bundled string of ~290-330 large, liquid US tickers.
- This is a **proxy for S&P 500 by market cap**, filtered to optionable names where A/A+ grades are plausible. Not an official index feed.
- Tickers that no longer exist are skipped during `refreshStock` (error kept, not guessed).
- **Extension:** `.env` `WHEEL_EXTRA_SYMBOLS=TSM,ASML,ARM` (comma-separated, validated by `isValidTicker`) is merged with `Set` deduplication.
- **Quarterly refresh (spec):** Each quarter (Mar/Jun/Sep/Dec) run `scripts/universe-refresh.ts` which pulls current `SPY`/`IVV` holdings via `yahooQuoteSummary` holdings module, diffs vs `BASE_STOCK_UNIVERSE`, and opens a PR with `Added: X, Removed: Y`. Reviewed manually — not auto-merged. Version stored as `universeVersion: YYYY-Qn` in footer.

## 2. Stock Data & Hydration

- **Fetch:** `src/lib/stock-service.ts:refreshStock(ticker)` — `Promise.all([yahooBars(ticker,"2y"), yahooQuoteSummary(ticker, MODULES)])`
  - `MODULES = ["financialData","defaultKeyStatistics","summaryDetail","calendarEvents","price","assetProfile"]`
  - `TTL = 12 hours` (`STOCK_TTL_MS`). Failed tickers retried after TTL.
- **Mapping:** `src/lib/stock-parse.ts:parseStockSummary(qs, tech)` → `StockInputs` + `StockEventsJson`
  - `marketCap = price.marketCap ?? summaryDetail.marketCap`
  - `debtToEquity = financialData.debtToEquity / 100` (Yahoo reports %)
  - `price = tech.price ?? financialData.currentPrice ?? price.regularMarketPrice`
  - `dd1y, hv30, sma200, supports` come from `computeTechnicals(bars)` on 2y daily bars.
  - `events.nextEarnings = calendarEvents.earnings.earningsDate[0]` (earliest), `earningsEstimated = dates.length>1 && last-first>1d`, `exDividend = calendarEvents.exDividendDate ?? summaryDetail.exDividendDate`
- **Storage:** `db.stocks` row with `fundamentals: StockInputs`, `events, technicals, priceAt`. `getAllStocks()` filters `fundamentals && technicals` (hydrated).

## 3. Stock Quality Grade (A+..F)

**File:** `src/lib/stock-quality.ts:computeStockQuality(i: StockInputs)`

### Pillars (5, fixed weights)

| Pillar | Weight | Inputs → Part score via BANDS |
|---|---|---|
| Business quality | 0.30 | operatingMargin, roe, fcfMargin = freeCashflow/totalRevenue |
| Financial strength | 0.20 | debtToEquity, netDebtEbitda = (totalDebt-totalCash)/ebitda, currentRatio |
| Valuation | 0.20 | forwardPE, pegRatio, fcfYield = freeCashflow/marketCap |
| Analyst view | 0.15 | recMean (1=buy..5=sell) + upside = targetMean/price-1 — **only if analystCount ≥ 8** |
| Size & stability | 0.15 | marketCap (log10), beta, dd1y (peak-to-trough) |

### Bands (fixed, not peer-ranked)

```
opMargin: 0%→0, 8%→40, 15%→70, 25%→90, 35%→100
roe: same
fcfMargin: 0%→0, 5%→50, 12%→80, 20%→100
debtEquity: 0→100, 0.5→90, 1→70, 2→40, 4→0
netDebtEbitda: 0→100, 1→90, 2→70, 3→45, 5→0
currentRatio: 0.5→0, 1→50, 1.5→80, 2→100
forwardPE: 8→100, 15→90, 20→75, 25→55, 35→25, 50→0
peg: 0.8→100, 1.5→75, 2.5→40, 4→0
fcfYield: 0%→0,2%→40,4%→70,6%→90,8%→100
recMean: 1→100,1.8→90,2.3→70,3→35,4→0
upside: -10%→0,0%→35,10%→65,20%→90,30%→100
marketCap: $1B→0,$10B→35,$50B→70,$200B→90,$1T→100 (log10)
beta:0.6→100,1→80,1.3→55,1.8→15,2.5→0
drawdown:5%→100,15%→80,25%→55,40%→20,55%→0
```

Score via `interp(band, value)` linear interpolation. Pillar score = avg(parts). `coverage = sum(weight where score!=null)`. Requires **≥0.70** else `grade=null`.

### Grade thresholds

```
≥90 = A+ Outstanding
≥80 = A Excellent
≥65 = B Good
≥50 = C Fair
≥35 = D Weak
<35 = F Poor
```

### Hard caps (always, even in Custom mode)

- `operatingMargin<0` → max C (or `profitMargin<0` → max C)
- `freeCashflow<0` → max B
- `marketCap<10B` → max B
- `recMean≥3.5` with ≥8 analysts → max C
- `dd1y≥40%` → max B
`caps[]` array explains each. `rawGrade` before caps vs `grade` after caps stored.

Summary: `"A (Excellent). Strong on valuation; weak on size."`

### Inclusive presets

- `A+` → rank ≤ A+ (≥90)
- `A` → rank ≤ A (≥80) includes A+
- `B` → rank ≤ B (≥65) includes B,A,A+
- `C` → rank ≤ C (≥50) includes all above
Implementation: `stockGradeRank(grade) <= stockGradeRank(minGrade)` — B pulls B and better, as requested.

### Custom stock filter (explicit)

When `preset=custom`, eligibility bypasses grade and checks fundamentals directly against user thresholds (see `src/lib/stock-presets.ts:STOCK_PRESETS`). Grade still computed and shown in options list for reference (always computed column). Caps still applied for display.

Example custom: `opMarginMin=0.15, debtEquityMax=1.0, fwdPEMax=25, mktCapMin=1e10, betaMax=1.3, ddMax=0.25, optionableOnly=true`. Missing threshold = no filter on that field.

## 4. Option Scan & Wheel Logic

**Files:** `src/lib/wheel-service.ts`, `src/lib/wheel.ts`, `src/lib/options-providers.ts`

- **Eligible first:** `eligibleStocks()` filters `grade !=null && rank≤SCAN_MIN_GRADE` (default A). Then custom stock filter applied.
- **Stored scan window:** `SCAN_DTE_MIN=7, SCAN_DTE_MAX=70`, `|delta|≤0.5`, `bid>0` fetched via `getOptionChain({price,dteMin,dteMax,divYield})` — Alpaca primary, Yahoo backup. `contracts` stored in `wheelScans` with `source/fallbackReason/scannedAt/price`.
- **TTL:** 20m market hours, 4h closed. `staleScanTickers()` triggers `runScanBatch`.
- **Screen (tight):** `src/lib/wheel-service.ts:getWheelResults(f)` loops eligible, gets `stockCtx(g, price)` with `nextEarnings, exDividend, beta, hv30, sma200, supports`. Applies user option filters:
  - DTE 21-50 (default), Δ 0.15-0.30 abs, minOi 100, maxSpread 10% `(ask-bid)/mid`, minAnnReturn 8%, allowEarnings false.
  - Plus `trendOnly` (price≥sma200), `divOnly` (yield>0.5%), `minScore 15`, `account` R/T.
- **evaluatePut(c,s,p,today):** rejects `no-quote/itm/dte/delta/oi/spread/earnings/return`. Computes `credit=bid+0.25*(ask-bid)` (limit fill estimate), `roc=credit/(strike-credit)`, `annRoc=roc*365/dte`, `breakeven=strike-credit`, `otmPct, breakevenCushion, σDistance=(price-strike)/price / (iv*sqrt(dte/365))`, `supportAboveStrike, belowSma200, ivHv=iv/hv30`. `score=min(annRoc,1)*probOtm(1-|Δ|)*liq*struct*100` where `liq=clamp(1-0.5*spread/max,0.5,1)*(oi≥500?1:0.9)` and `struct=1+0.1 support+0.1σ≥1 -0.3 earnings -0.15 below200`.
- **Held-back by earnings:** re-runs with `allowEarnings:true` to count hidden tickers.

## 5. Tooltips for Grade Insights

- `WheelGradeCardDark` shows pillar scores, details (`operating margin 24%`), caps, summary.
- `WheelTable` Grade badge tooltip: `Score 87 (A) — quality 92, strength 78... Caps: Market cap <10B → B cap. Return 18% is rich but grade B due to beta 1.8 — assignment loss not deductible in IRA.`
- Enables: user sees high options return yet low grade and can still choose to sell — data provided, decision theirs.

## 6. Verification mapping (finviz ↔ schwab)

- **Finviz:** MarketCap>$10B, Fwd P/E<25, PEG<2, DebtEq<1, OperatingMargin>15%, ROE>15%, Beta<1.3, CurrentRatio>1.2 — plus manual FCF check. Expect ±15% vs our count due to Yahoo vs Finviz feed differences.
- **Schwab:** Chain → Puts OTM → Expiry DTE 21-50 → Delta -0.15 to -0.30 → OI≥100 → compute `(ask-bid)/mid ≤10%` and `annRoc` manually. Check earnings calendar for earnings gap.

## 7. Data sources & limits

- Stocks: Yahoo Finance unofficial (delayed, fundamentals can be stale/estimated). No guessing — N/A when missing.
- Options: Alpaca (indicative free feed, can lag) → Yahoo backup. Deltas from feed or Black-Scholes model (marked ≈).
- Universe versioned YYYY-Qn, displayed in footer.
