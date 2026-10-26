# Deployment

WheelCore keeps the existing dashboard, screener, simulator, and research academy while adding provider-backed views within the same workstations. The container runs SQL migrations (`/migrate`, from the committed `drizzle/` folder) and then starts the Next.js standalone server. It needs: a Postgres 14+ database, outbound HTTPS to the data providers, and the secrets below.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres URL. Set `DATABASE_SSL=true` if the provider requires TLS. |
| `APP_USERNAME` / `APP_PASSWORD` | Login for the whole app. Password ≥ 12 chars. |
| `PORTFOLIO_ENCRYPTION_KEY` | ≥ 32 random chars (`openssl rand -base64 48`). Changing it makes previously encrypted values unreadable. |
| `QUOTE_SNAPSHOTS` | Optional. `false` turns off the in-process bid/ask sampler (needs the server running during US market hours; uses the `quote_snapshots` table, created by migration `0001`). |
| `SEC_USER_AGENT` | `AppName you@domain.com` (SEC EDGAR requirement). |
| `SEED_DEMO_DATA=true` | Optional. Creates 3 labelled demo portfolios once, on first visit. Good for test environments. |
| `FRED_API_KEY`, `FINNHUB_API_KEY` | Optional. |
| `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` | Optional but recommended for the Options Wheel pages: Alpaca is the **primary** option-chain source (bid/ask, greeks, implied volatility, open interest). Without them, or if Alpaca fails, Yahoo Finance is the automatic backup (deltas modelled, marked ≈). |
| `ALPACA_PAPER`, `ALPACA_OPTIONS_FEED`, `OPTIONS_PROVIDER` | `true`/`false` (paper vs live keys), `indicative`/`opra` (free vs paid feed), `auto`/`alpaca`/`yahoo`. Blank values fall back to the defaults. |
| `WHEEL_SCANNER` | Background refresh of stock data and option scans while the app runs (default on in production). Uses tables `stocks` and `wheel_scans`, created by migration `0002`. |
| `WHEEL_EXTRA_SYMBOLS`, `RISK_FREE_RATE` | Optional: extra tickers for the ~330-stock universe; override the risk-free rate used to model deltas. |

Health probe: `GET /api/health` (public, returns `{ok:true}` when the DB answers).

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
Put it behind HTTPS (Caddy, nginx, a cloud load balancer). Basic auth over plain HTTP exposes the password.

## Option C – Fly.io / Railway / AWS

Build from the `Dockerfile`, attach Postgres, set the variables above, health check `/api/health`. Run a single instance, or several (migrations take an advisory lock so concurrent starts are safe).

## Operations

* **Backups:** `pg_dump "$DATABASE_URL" > backup.sql` (portfolio positions and transactions live only in Postgres; market data is re-fetchable).
* **Schema changes:** edit `src/db/schema.ts`, run `npm run db:generate`, commit the new SQL in `drizzle/`.
* **Upstream data:** Yahoo Finance endpoints are unofficial and may rate-limit or change; the app keeps and badges stale cached data when a provider fails.

## Upgrading an existing deployment
Migrations run automatically on container start (`0001` quote snapshots, `0002` wheel tables). Rebuild with `docker compose build --no-cache web && docker compose up -d`. **Never** run `docker compose down -v`: it deletes the database volume. Open **Wheel Strategy Lab → Live Provider Scanner & Journal** to hydrate the stock universe and scan option chains in small batches. The original strategy simulator and tracker remain available alongside it; live scans do not place orders.
