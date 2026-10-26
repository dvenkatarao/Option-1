import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Unauthenticated liveness/readiness probe for the platform. Reveals nothing beyond up/down. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[health] database check failed:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
