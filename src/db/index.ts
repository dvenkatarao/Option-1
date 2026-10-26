import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const isDevelopment = process.env.NODE_ENV !== "production";
const databaseUrl =
  process.env.DATABASE_URL ||
  (isBuild || isDevelopment ? "postgresql://postgres:postgres@127.0.0.1:5432/app_db" : undefined);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required in production");
}

const globalForDb = globalThis as typeof globalThis & { __etfPgPool?: Pool };

function createPool() {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    // Managed Postgres (Render, Neon, RDS, ...) normally requires TLS.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  // An idle client erroring (e.g. DB restart) must not crash the Node process.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  return pool;
}

export const pool = (globalForDb.__etfPgPool ??= createPool());
export const db = drizzle(pool);
