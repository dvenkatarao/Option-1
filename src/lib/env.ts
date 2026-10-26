import { z } from "zod";

/**
 * Strict environment validation.
 *
 * In production the process refuses to start (first call to getEnv()) when a required
 * secret is missing or still set to a placeholder. In development/test, a clearly-labelled
 * throwaway encryption key is used so `npm run dev` works with only DATABASE_URL set.
 */
const DEV_ENCRYPTION_KEY = "dev-only-insecure-key-do-not-use-in-production-0000";

const PLACEHOLDER_PATTERNS = [/change[-_ ]this/i, /your[-_ ]/i, /example\.com/i, /dev-only/i];

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Set to "true" when the database requires TLS (managed Postgres: Render, Neon, RDS, ...). */
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORTFOLIO_ENCRYPTION_KEY: optionalString,
  /** Shared access credentials (HTTP Basic). Required in production. */
  APP_USERNAME: z.preprocess(emptyToUndefined, z.string().min(1).default("admin")),
  APP_PASSWORD: optionalString,
  /** Opt-in: create three demo portfolios on first visit when the portfolio table is empty. */
  SEED_DEMO_DATA: z.enum(["true", "false"]).default("false"),
  SEC_USER_AGENT: optionalString,
  SNAPTRADE_CLIENT_ID: optionalString,
  SNAPTRADE_CONSUMER_KEY: optionalString,
  PLAID_CLIENT_ID: optionalString,
  PLAID_SECRET: optionalString,
  PLAID_ENV: z.enum(["sandbox", "development", "production"]).default("sandbox"),
  FRED_API_KEY: optionalString,
  FINNHUB_API_KEY: optionalString,
  ALPHAVANTAGE_API_KEY: optionalString,
  POLYGON_API_KEY: optionalString,
  /** Alpaca market-data + trading keys (free account). When both are set Alpaca is the primary option-chain source. */
  ALPACA_API_KEY: optionalString,
  ALPACA_SECRET_KEY: optionalString,
  /** true = keys belong to a paper account (paper-api.alpaca.markets); false = live account. */
  ALPACA_PAPER: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("true")),
  /** indicative = free feed; opra = full feed (needs an Alpaca market-data subscription). */
  ALPACA_OPTIONS_FEED: z.preprocess(emptyToUndefined, z.enum(["indicative", "opra"]).default("indicative")),
  /** auto = Alpaca first, Yahoo as backup; alpaca / yahoo = force one provider. */
  OPTIONS_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["auto", "alpaca", "yahoo"]).default("auto")),
  /** Background stock/option scanner for the Wheel pages. Default: on in production, off elsewhere. */
  WHEEL_SCANNER: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  /** Comma-separated extra tickers to add to the S&P 500 scan universe. */
  WHEEL_EXTRA_SYMBOLS: optionalString,
  /** Overrides the risk-free rate (fraction, e.g. 0.04) used to model option deltas when the feed has none. */
  RISK_FREE_RATE: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(0.25).optional()),
});

export type Env = Omit<z.infer<typeof envSchema>, "PORTFOLIO_ENCRYPTION_KEY"> & {
  PORTFOLIO_ENCRYPTION_KEY: string;
};

let parsed: Env | null = null;

/** True while `next build` collects page data; secrets are not available/needed then. */
const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

export function getEnv(): Env {
  if (parsed) return parsed;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const env = result.data;
  const prod = env.NODE_ENV === "production" && !isBuildPhase();

  if (prod) {
    const problems: string[] = [];
    const key = env.PORTFOLIO_ENCRYPTION_KEY;
    if (!key || key.length < 32 || PLACEHOLDER_PATTERNS.some((p) => p.test(key))) {
      problems.push("PORTFOLIO_ENCRYPTION_KEY must be a random string of at least 32 characters (try: openssl rand -base64 48)");
    }
    if (!env.APP_PASSWORD || env.APP_PASSWORD.length < 12) {
      problems.push("APP_PASSWORD must be set to at least 12 characters (the app has no other login)");
    }
    if (problems.length) throw new Error(`Refusing to start in production: ${problems.join("; ")}`);
    if (!env.SEC_USER_AGENT || /example\.com/i.test(env.SEC_USER_AGENT)) {
      console.warn("[env] SEC_USER_AGENT should contain your real contact email; SEC EDGAR may block placeholder user agents.");
    }
  }

  parsed = {
    ...env,
    PORTFOLIO_ENCRYPTION_KEY: env.PORTFOLIO_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
  };
  return parsed;
}

/** Test hook. */
export function resetEnvCache() {
  parsed = null;
}
