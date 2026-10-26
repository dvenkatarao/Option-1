import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { portfolios } from "@/db/schema";

/** Error that is safe to show to the client. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 1_000_000; // 1 MB; CSV imports are far smaller than this

/** Parse and validate a JSON body. Throws ApiError(400/413) with a readable message. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) throw new ApiError(413, "Request body too large");
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new ApiError(400, "Could not read request body");
  }
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "Request body too large");
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "Body must be valid JSON");
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw new ApiError(400, msg);
  }
  return r.data;
}

/** Wraps a route handler: ApiError -> its status, anything else -> logged + generic 500 (no internals leaked). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
      console.error("[api] unhandled error:", e);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function requirePortfolio(id: string) {
  const rows = await db.select().from(portfolios).where(eq(portfolios.id, id)).limit(1);
  if (!rows[0]) throw new ApiError(404, "Portfolio not found");
  return rows[0];
}

/** Finite number coerced from number or numeric string (the UI posts strings). */
export const num = z.coerce.number().refine(Number.isFinite, "must be a finite number");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
