# WheelCore Intelligence Terminal

WheelCore is an ETF, portfolio, macro and options-wheel research interface. This repository keeps the original WheelCore dashboard and visual system as the UI baseline, with the `etf-src` data engine integrated as additional provider-backed views inside the existing workstations.

## Workstations

- **Mission Control** — original dashboard and local sample data.
- **ETF Intelligence** — provider-backed ETF universe screener and fund detail dossier. The legacy illustrative screener and sample comparison are hidden by default and can be enabled with `NEXT_PUBLIC_ENABLE_SAMPLE_ETF_SCREENS=true`.
- **Wheel Strategy Lab** — original scanner, simulator and campaign tracker, plus provider-backed stock/option-chain scanning and a persistent wheel journal.
- **Portfolio Studio** — original educational portfolio simulator, plus PostgreSQL-backed portfolios, holdings, CSV imports, transactions, income and risk analytics.
- **Research Academy** — original educational material, plus live macro signals, news/events, transparent ETF rankings, source health and data-coverage tools.

The demo and provider-backed views are labeled separately. Data endpoints do not fabricate provider values; unavailable fields remain `N/A`, cached values are marked stale, and each provider-backed panel reports its sources or as-of dates where available. Next.js is the sole application runtime and production build; Vite is retained only as test-runner infrastructure for Vitest, not as a second UI build path.

## Data and features

- ETF history, distributions, profiles, holdings, screen metrics and cached quote data use the included Yahoo Finance adapters (unofficial/delayed endpoints).
- Macro observations and calendars use FRED, the New York Fed, the Federal Reserve and BLS. A FRED API key is optional for the keyless series used by the macro panel.
- News and regulatory events use government/SEC feeds; Finnhub's upcoming-earnings calendar is optional.
- Options chains prefer Alpaca when configured and fall back to Yahoo Finance. The wheel screen applies deterministic liquidity, delta, spread, DTE, earnings and return filters; it is for research only and never routes orders.
- PostgreSQL/Drizzle stores market-data cache, ETF history/profiles, stock fundamentals and technicals, wheel scans/IV snapshots, portfolios, holdings, transactions and saved wheel positions.
- **Research → Live Research & Sources** includes a guided ETF starter allocation, stored-data similarity groups (5-year adjusted-return correlation ≥0.95 or reported top-holdings overlap ≥50%), and transparent rankings. Similarity overlap is a lower bound because provider holdings lists are partial. ETF detail adds deterministic 50/200-day trend context and RSI14 from stored split-adjusted closes; these are descriptive, not forecasts.
- Holdings-weighted analyst consensus is opt-in (`/api/recommend?analyst=1`), contributes 10% only when recommendation data covers at least 50% of a fund's reported top-holdings weight, and returns coverage alongside rankings. Missing analyst values are never imputed.
- Source catalog and field-population reports are available under **Research → Live Research & Sources**. The machine-readable coverage endpoint is `/api/coverage`; the provider spec is `/api/spec`.
- Bundled dashboard, wheel, portfolio, screener, research-radar, and global-search examples are explicitly labeled as illustrative; they are not current quotes, broker positions, or realized performance. Provider-backed panels report their sources, as-of dates, or stale state where available.

## Run locally

### Docker Compose

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, APP_PASSWORD, PORTFOLIO_ENCRYPTION_KEY, and SEC_USER_AGENT.
docker compose up --build -d
```

The web container applies committed Drizzle migrations before starting. Open `http://localhost:3000` and authenticate with `APP_USERNAME` / `APP_PASSWORD` (default username: `admin`). Do not use plain HTTP for a public deployment; put the service behind HTTPS.

### Native development

Requires Node.js 20.9+ and PostgreSQL. The checked-in `.env.example` documents environment variables; for a local database, set `DATABASE_URL` and then run:

```bash
npm ci
npm run db:migrate
npm run dev
```

The dev server permits the local development convenience path when `APP_PASSWORD` is unset. Production intentionally fails closed unless `APP_PASSWORD` and a strong `PORTFOLIO_ENCRYPTION_KEY` are configured. The shared Basic credential currently grants access to all persisted portfolios and transactions; there are no per-user sessions or ownership checks, so treat the deployment as single-owner and do not share access with unrelated users. The access proxy returns HTTP 429 after five failed Basic credentials from one client IP in 15 minutes. This counter is process-local; multi-instance deployments still need a shared ingress/WAF rate limit, and the trusted edge must overwrite `X-Forwarded-For`.

## Configuration & deployment

See [`.env.example`](.env.example) and [`DEPLOYMENT.md`](DEPLOYMENT.md). Key settings:

- `DATABASE_URL` — Postgres connection string; set `DATABASE_SSL=true` when required by the host.
- `APP_USERNAME` / `APP_PASSWORD` — one shared HTTP Basic credential for single-owner use; every holder can access the same portfolios and transactions.
- `PORTFOLIO_ENCRYPTION_KEY` — at least 32 random characters; changing it invalidates previously encrypted credentials.
- `SEC_USER_AGENT` — descriptive application name and a real contact email for SEC EDGAR.
- `ALPACA_API_KEY` / `ALPACA_SECRET_KEY`, `OPTIONS_PROVIDER`, `ALPACA_OPTIONS_FEED` — options-chain provider configuration.
- `WHEEL_SCANNER`, `WHEEL_EXTRA_SYMBOLS`, `QUOTE_SNAPSHOTS` — background refresh/snapshot behavior.
- `FRED_API_KEY`, `FINNHUB_API_KEY` — optional enhanced source access.
- `NEXT_PUBLIC_ENABLE_SAMPLE_ETF_SCREENS` — defaults to `false`, showing Live ETF Research without the bundled sample screener/comparison tabs. Set to `true` to reveal them; restart `next dev` locally or rebuild/redeploy production. This is a public UI flag, not a secret.

Live SnapTrade/Plaid broker connections are not implemented; the API returns an explicit not-supported response. Use CSV imports or manual ledger entries for real positions. Sample/demo portfolios are explicitly labeled.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

CI audits production dependencies for moderate-or-higher advisories and the full dependency tree for high/critical advisories. If the Drizzle schema changes, generate and commit a migration with `npm run db:generate`. Keep credentials in server-side environment variables; never commit `.env`. See [SECURITY.md](SECURITY.md) for vulnerability reporting and the current access/data-isolation limitations.

## License

This project is licensed under the GNU General Public License, version 3 or (at your option) any later version. See [LICENSE](LICENSE).
