# Deployment

WheelCore keeps the existing dashboard, screener, simulator, and research academy while adding provider-backed views within the same workstations. The container runs SQL migrations (`/migrate`, from the committed `drizzle/` folder) and then starts the Next.js standalone server. It needs: a Postgres 14+ database, outbound HTTPS to the data providers, and the secrets below.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres URL. Set `DATABASE_SSL=true` if the provider requires TLS. |
| `APP_USERNAME` / `APP_PASSWORD` | One shared HTTP Basic login for single-owner use. Password ≥ 12 chars. Every holder can access all portfolios and transactions; per-user accounts and ownership checks are not implemented. |
| `PORTFOLIO_ENCRYPTION_KEY` | ≥ 32 random chars (`openssl rand -base64 48`). Changing it makes previously encrypted values unreadable. |
| `QUOTE_SNAPSHOTS` | Optional. `false` turns off the in-process bid/ask sampler (needs the server running during US market hours; uses the `quote_snapshots` table, created by migration `0001`). |
| `SEC_USER_AGENT` | `AppName you@domain.com` (SEC EDGAR requirement). |
| `SEED_DEMO_DATA=true` | Optional. Creates 3 labelled demo portfolios once, on first visit. Good for test environments. |
| `FRED_API_KEY`, `FINNHUB_API_KEY` | Optional. |
| `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET`, `SCHWAB_REDIRECT_URI` | Optional Schwab Market Data OAuth app. Register the exact redirect URL ending in `/api/v1/auth/callback`. Connected Schwab data is tried first in `auto`; OAuth tokens are encrypted with `PORTFOLIO_ENCRYPTION_KEY`. The app does not use account/trading scopes. |
| `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` | Optional options-chain source (bid/ask, Greeks, implied volatility, open interest). In `auto` mode it follows connected Schwab and precedes Yahoo Finance. |
| `ALPACA_PAPER`, `ALPACA_OPTIONS_FEED`, `OPTIONS_PROVIDER` | `true`/`false` (paper vs live keys), `indicative`/`opra` (free vs paid feed), `auto`/`schwab`/`alpaca`/`yahoo`. Blank values fall back to the defaults. |
| `WHEEL_SCANNER` | Background refresh of stock data and option scans while the app runs (default on in production). Uses tables `stocks` and `wheel_scans`, created by migration `0002`. |
| `WHEEL_EXTRA_SYMBOLS`, `RISK_FREE_RATE` | Optional: extra tickers for the ~330-stock universe; override the risk-free rate used to model deltas. |

Schwab Market Data setup: after setting server environment variables, open Wheel Strategy Lab and use **Connect**; then use **Test SPY chain** for the first direct provider request. `SCHWAB_REDIRECT_URI` must exactly match the portal's registered callback, including host and port. The portal's `127.0.0.1:8000` callback works only when the browser can reach the app or a proxy on that exact address/port. The test displays Schwab's `isDelayed` flag and provider quote timestamps when returned; absence of the delayed flag is not proof of real-time entitlement. No Schwab credentials or live response were available during implementation, so verify the initial chain's IV and freshness before relying on them.

Health probe: `GET /api/health` (public, returns `{ok:true}` when the DB answers).

## Authentication and rate limiting

The application currently has one shared Basic credential and a global portfolio dataset; it does not isolate portfolios by user. Use it only for a single trusted owner, not unrelated users or separate customer accounts. The Next.js access proxy throttles five failed Basic-credential attempts per client IP over a 15-minute window and returns `429` with `Retry-After`. Counters are in process memory: they reset on restart and are not shared across replicas. Put internet-facing deployments behind HTTPS and a trusted ingress/WAF that also rate-limits authentication attempts; configure that ingress to overwrite `X-Forwarded-For` so clients cannot choose their own rate-limit key. Add a shared edge limit before scaling to multiple instances.

## Option A – Render (test environment in ~5 minutes)

1. Push this folder to a GitHub repository.
2. Render dashboard → **New → Blueprint** → pick the repo (it reads `render.yaml`: web service + Postgres).
3. When prompted, enter `SEC_USER_AGENT`. `APP_PASSWORD` and `PORTFOLIO_ENCRYPTION_KEY` are generated; read the password under the service's **Environment** tab.
4. Open the service URL, log in as `admin` with that password.

## Option B – Any Docker host

```bash
cp .env.example .env     # set APP_PASSWORD, PORTFOLIO_ENCRYPTION_KEY, POSTGRES_PASSWORD, SEC_USER_AGENT
docker compose up --build -d
```
Put it behind HTTPS (Caddy, nginx, a cloud load balancer). Basic auth over plain HTTP exposes the password. Configure the trusted proxy to overwrite the forwarded client-IP header and apply an ingress/WAF authentication rate limit; the built-in limit is process-local.

## Option C – Fly.io / Railway / AWS

Build from the `Dockerfile`, attach Postgres, set the variables above, and health check `/api/health`. Run one instance unless your ingress/WAF provides a shared authentication rate limit; the app's in-process lockout counters are not synchronized across replicas. Migrations take an advisory lock, so concurrent starts are safe.

## Operations

* **Backups:** `pg_dump "$DATABASE_URL" > backup.sql` (portfolio positions and transactions live only in Postgres; market data is re-fetchable).
* **Schema changes:** edit `src/db/schema.ts`, run `npm run db:generate`, commit the new SQL in `drizzle/`.
* **Upstream data:** Yahoo Finance endpoints are unofficial and may rate-limit or change; the app keeps and badges stale cached data when a provider fails.

## Upgrading an existing deployment
Migrations run automatically on container start; the current set includes the encrypted Schwab connection table and option-chain delay/staleness metadata. Rebuild with `docker compose build --no-cache web && docker compose up -d`. **Never** run `docker compose down -v`: it deletes the database volume. Open **Wheel Strategy Lab → Live Provider Scanner & Journal** to hydrate the stock universe and scan option chains in small batches. The original strategy simulator and tracker remain available alongside it; live scans do not place orders.
